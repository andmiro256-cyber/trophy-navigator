//! Голосовой поиск: короткая фраза («Солотча», «поехали в Касимов») → текст, полностью в приложении.
//!
//! Запись — cpal (микрофон системы по умолчанию; одинаково в Linux/Windows/macOS, мимо WebView —
//! у WebKitGTK нет распознавания речи). Распознавание — whisper.cpp (whisper-rs), модель
//! `ggml-base-q5_1.bin` (57 МБ) скачивается один раз в папку приложения с проверкой SHA-256.
//! Сервер не нужен (решение Андрея 09.10: без сервера и без платных сервисов).
//! Фраза → название (служебные слова, падежи, нечёткое совпадение) — в UI (ui/tn-voice.js).

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const MODEL_FILE: &str = "ggml-base-q5_1.bin";
pub const MODEL_SHA256: &str = "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898";
pub const MODEL_SIZE: u64 = 59_707_625;
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin";
/// Дольше фразу не пишем: поиск — одно-два слова.
const MAX_RECORD: Duration = Duration::from_secs(8);
const TARGET_RATE: u32 = 16_000;

static MODELS_DIR: OnceLock<PathBuf> = OnceLock::new();
static CONTEXT: OnceLock<Mutex<Option<Arc<whisper_rs::WhisperContext>>>> = OnceLock::new();
static RECORDER: OnceLock<Mutex<Option<Recording>>> = OnceLock::new();
/// Отмена распознавания (кнопка 🎤 или Esc во время «Распознаю…»): whisper проверяет флаг между шагами.
static CANCEL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

struct Recording {
    stop: mpsc::Sender<()>,
    done: mpsc::Receiver<Result<(Vec<f32>, u32), String>>,
}

pub fn init<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(dir) = app.path().app_local_data_dir() {
        let dir = dir.join("models");
        let _ = fs::create_dir_all(&dir);
        let _ = MODELS_DIR.set(dir);
    }
}

fn model_path() -> Result<PathBuf, String> {
    MODELS_DIR
        .get()
        .map(|d| d.join(MODEL_FILE))
        .ok_or_else(|| "папка приложения недоступна".to_string())
}

#[derive(Serialize)]
pub struct VoiceStatus {
    pub model: bool,
    pub size: u64,
    pub recording: bool,
}

#[tauri::command]
pub fn voice_status() -> VoiceStatus {
    let ready = model_path()
        .ok()
        .and_then(|p| fs::metadata(p).ok())
        .is_some_and(|m| m.len() == MODEL_SIZE);
    let recording = RECORDER
        .get()
        .and_then(|m| m.lock().ok().map(|g| g.is_some()))
        .unwrap_or(false);
    VoiceStatus { model: ready, size: MODEL_SIZE, recording }
}

#[derive(Clone, Serialize)]
struct Progress {
    done: u64,
    total: u64,
}

/// Скачать модель распознавания (один раз). Прогресс — событие `voice-model-progress`.
#[tauri::command]
pub async fn voice_download_model<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || download_model(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn download_model<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let path = model_path()?;
    if fs::metadata(&path).map(|m| m.len() == MODEL_SIZE).unwrap_or(false) {
        return Ok(());
    }
    let part = path.with_extension("bin.part");
    let resp = ureq::get(MODEL_URL)
        .set("User-Agent", "TrophyNavigator-Desktop")
        .timeout(Duration::from_secs(600))
        .call()
        .map_err(|e| format!("модель распознавания не скачалась: {e}"))?;
    let mut reader = resp.into_reader();
    let mut file = fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let (mut done, mut last) = (0u64, Instant::now());
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("обрыв загрузки: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        hasher.update(&buf[..n]);
        done += n as u64;
        if last.elapsed() > Duration::from_millis(200) {
            let _ = app.emit("voice-model-progress", Progress { done, total: MODEL_SIZE });
            last = Instant::now();
        }
    }
    drop(file);
    let sha = format!("{:x}", hasher.finalize());
    if done != MODEL_SIZE || sha != MODEL_SHA256 {
        let _ = fs::remove_file(&part);
        return Err("модель скачалась повреждённой — попробуйте ещё раз".into());
    }
    fs::rename(&part, &path).map_err(|e| e.to_string())?;
    let _ = app.emit("voice-model-progress", Progress { done, total: MODEL_SIZE });
    Ok(())
}

/// Начать запись с микрофона по умолчанию. Остановка — `voice_stop` (или сама через 8 с).
#[tauri::command]
pub fn voice_start() -> Result<(), String> {
    let slot = RECORDER.get_or_init(|| Mutex::new(None));
    let mut guard = slot.lock().map_err(|_| "запись занята")?;
    if guard.is_some() {
        return Ok(());
    }
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (done_tx, done_rx) = mpsc::channel();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    // поток cpal не Send на части платформ — живёт и умирает в своём потоке
    std::thread::spawn(move || {
        let result = record(stop_rx, &ready_tx);
        let _ = ready_tx.send(Err("запись не началась".into()));
        let _ = done_tx.send(result);
    });
    match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => {
            *guard = Some(Recording { stop: stop_tx, done: done_rx });
            Ok(())
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("микрофон не ответил".into()),
    }
}

fn record(stop: mpsc::Receiver<()>, ready: &mpsc::Sender<Result<(), String>>) -> Result<(Vec<f32>, u32), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let fail = |e: String| {
        let _ = ready.send(Err(e.clone()));
        e
    };
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| fail("микрофон не найден".into()))?;
    let config = device
        .default_input_config()
        .map_err(|e| fail(format!("микрофон недоступен: {e}")))?;
    let rate = config.sample_rate().0;
    let channels = config.channels() as usize;
    let samples = Arc::new(Mutex::new(Vec::<f32>::with_capacity(rate as usize * 8)));
    let sink = samples.clone();
    let err_cb = |e| eprintln!("voice: ошибка микрофона: {e}");
    let mono = move |frame: &mut dyn Iterator<Item = f32>| -> f32 {
        let mut sum = 0.0;
        let mut n = 0;
        for v in frame.take(channels) {
            sum += v;
            n += 1;
        }
        if n == 0 { 0.0 } else { sum / n as f32 }
    };
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.clone().into(),
            move |data: &[f32], _| {
                if let Ok(mut s) = sink.lock() {
                    for f in data.chunks(channels) { s.push(mono(&mut f.iter().copied())); }
                }
            },
            err_cb,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.clone().into(),
            move |data: &[i16], _| {
                if let Ok(mut s) = sink.lock() {
                    for f in data.chunks(channels) { s.push(mono(&mut f.iter().map(|v| *v as f32 / 32768.0))); }
                }
            },
            err_cb,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config.clone().into(),
            move |data: &[u16], _| {
                if let Ok(mut s) = sink.lock() {
                    for f in data.chunks(channels) { s.push(mono(&mut f.iter().map(|v| (*v as f32 - 32768.0) / 32768.0))); }
                }
            },
            err_cb,
            None,
        ),
        other => return Err(fail(format!("формат микрофона не поддерживается: {other:?}"))),
    }
    .map_err(|e| fail(format!("микрофон не открылся: {e}")))?;
    stream.play().map_err(|e| fail(format!("микрофон не запустился: {e}")))?;
    let _ = ready.send(Ok(()));
    let _ = stop.recv_timeout(MAX_RECORD);
    drop(stream);
    let data = samples.lock().map(|s| s.clone()).unwrap_or_default();
    Ok((data, rate))
}

/// Линейная передискретизация в 16 кГц (для речи достаточно).
pub fn resample(input: &[f32], from: u32) -> Vec<f32> {
    if from == TARGET_RATE || input.is_empty() {
        return input.to_vec();
    }
    let ratio = from as f64 / TARGET_RATE as f64;
    let n = (input.len() as f64 / ratio).floor() as usize;
    (0..n)
        .map(|i| {
            let x = i as f64 * ratio;
            let j = x.floor() as usize;
            let t = (x - j as f64) as f32;
            let a = input[j];
            let b = *input.get(j + 1).unwrap_or(&a);
            a + (b - a) * t
        })
        .collect()
}

/// Обрезать тишину по краям и выровнять громкость: тихий микрофон ноутбука Whisper слышит хуже.
pub fn prepare(mut s: Vec<f32>) -> Vec<f32> {
    let peak = s.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    if peak > 1e-4 && peak < 0.5 {
        let k = 0.5 / peak;
        s.iter_mut().for_each(|v| *v *= k);
    }
    let thr = 0.02;
    let win = (TARGET_RATE / 50) as usize; // 20 мс
    let loud = |c: &[f32]| (c.iter().map(|v| v * v).sum::<f32>() / c.len().max(1) as f32).sqrt() > thr;
    let chunks: Vec<&[f32]> = s.chunks(win).collect();
    let first = chunks.iter().position(|c| loud(c));
    let last = chunks.iter().rposition(|c| loud(c));
    match (first, last) {
        (Some(a), Some(b)) => {
            let pad = 10; // 200 мс поля
            let from = a.saturating_sub(pad) * win;
            let to = ((b + 1 + pad) * win).min(s.len());
            let mut out = s[from..to].to_vec();
            // Whisper не любит фразы короче секунды — добиваем тишиной
            if out.len() < TARGET_RATE as usize {
                out.resize(TARGET_RATE as usize, 0.0);
            }
            out
        }
        _ => Vec::new(),
    }
}

#[derive(Serialize)]
pub struct VoiceResult {
    pub text: String,
    pub ms: u64,
    pub seconds: f32,
}

/// Остановить запись и распознать. `prompt` — подсказка Whisper (названия рядом с картой).
#[tauri::command]
pub async fn voice_stop(prompt: Option<String>) -> Result<VoiceResult, String> {
    let rec = RECORDER
        .get()
        .and_then(|m| m.lock().ok().and_then(|mut g| g.take()))
        .ok_or("запись не идёт")?;
    let _ = rec.stop.send(());
    tauri::async_runtime::spawn_blocking(move || {
        let (raw, rate) = rec
            .done
            .recv_timeout(Duration::from_secs(10))
            .map_err(|_| "запись не завершилась".to_string())??;
        CANCEL.store(false, std::sync::atomic::Ordering::SeqCst);
        if !has_speech(&raw, rate) {
            return Ok(VoiceResult { text: String::new(), ms: 0, seconds: 0.0 });
        }
        let audio = prepare(resample(&raw, rate));
        let seconds = audio.len() as f32 / TARGET_RATE as f32;
        if audio.is_empty() {
            return Ok(VoiceResult { text: String::new(), ms: 0, seconds: 0.0 });
        }
        let t = Instant::now();
        let text = transcribe(&audio, prompt.as_deref())?;
        let text = if plausible_russian(&text) { text } else { String::new() };
        Ok(VoiceResult { text, ms: t.elapsed().as_millis() as u64, seconds })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Отменить запись или уже идущее распознавание.
#[tauri::command]
pub fn voice_cancel() {
    CANCEL.store(true, std::sync::atomic::Ordering::SeqCst);
    if let Some(rec) = RECORDER.get().and_then(|m| m.lock().ok().and_then(|mut g| g.take())) {
        let _ = rec.stop.send(());
    }
}

/// Речь ли это: громкость выше шума (после выравнивания по пику шум тоже «громкий»,
/// поэтому смотрим на исходную запись — доля 20-мс окон заметно громче тихих).
pub fn has_speech(raw: &[f32], rate: u32) -> bool {
    let win = (rate / 50).max(1) as usize;
    let mut rms: Vec<f32> = raw.chunks(win).map(|c| (c.iter().map(|v| v * v).sum::<f32>() / c.len() as f32).sqrt()).collect();
    if rms.len() < 10 {
        return false;
    }
    rms.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let floor = rms[rms.len() / 10].max(1e-4); // тише 90 % окон — шум
    let loud = rms[rms.len() * 95 / 100];
    loud > 0.01 && loud / floor > 4.0
}

/// В ответе нет русских букв — Whisper «додумал» по шуму (бывает английское «Thank you»): не берём.
pub fn plausible_russian(text: &str) -> bool {
    let cyr = text.chars().filter(|c| ('а'..='я').contains(&c.to_lowercase().next().unwrap_or(*c)) || *c == 'ё' || *c == 'Ё').count();
    let letters = text.chars().filter(|c| c.is_alphabetic()).count();
    letters > 0 && cyr * 2 >= letters
}

fn context() -> Result<Arc<whisper_rs::WhisperContext>, String> {
    let slot = CONTEXT.get_or_init(|| Mutex::new(None));
    let mut g = slot.lock().map_err(|_| "распознавание занято")?;
    if let Some(ctx) = g.as_ref() {
        return Ok(ctx.clone());
    }
    let path = model_path()?;
    if !path.exists() {
        return Err("модель распознавания не скачана".into());
    }
    let ctx = whisper_rs::WhisperContext::new_with_params(
        &path,
        whisper_rs::WhisperContextParameters::default(),
    )
    .map_err(|e| format!("модель распознавания не открылась: {e}"))?;
    let ctx = Arc::new(ctx);
    *g = Some(ctx.clone());
    Ok(ctx)
}

fn transcribe(audio: &[f32], prompt: Option<&str>) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy};
    let ctx = context()?;
    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    // Один проход (greedy) вместо перебора 5 вариантов и окно кодировщика по длине фразы, а не 30 с:
    // на Windows-ноутбуке beam 5 + полное окно распознавали «очень долго» (Андрей 09.10).
    let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    p.set_language(Some("ru"));
    p.set_detect_language(false);
    p.set_translate(false);
    p.set_temperature_inc(0.0); // без повторов с «температурой» — повтор удваивал время
    let secs = audio.len() as f32 / TARGET_RATE as f32;
    p.set_audio_ctx(((secs * 50.0).ceil() as i32 + 64).clamp(128, 1500));
    p.set_abort_callback_safe(|| CANCEL.load(std::sync::atomic::Ordering::SeqCst));
    // фраза в пару слов: окно кодировщика по длине фразы склонно зацикливать текст («Тума Тума Тума…») —
    // ограничиваем длину ответа и ниже обрезаем повтор
    p.set_max_tokens(24);
    p.set_no_timestamps(true);
    p.set_single_segment(true);
    p.set_print_progress(false);
    p.set_print_realtime(false);
    p.set_print_special(false);
    p.set_suppress_blank(true);
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8);
    p.set_n_threads(threads as i32);
    let hint = prompt.unwrap_or("").chars().take(400).collect::<String>();
    let base = "Название населённого пункта, деревни или урочища.";
    let full_prompt = if hint.is_empty() { base.to_string() } else { format!("{base} {hint}") };
    p.set_initial_prompt(&full_prompt);
    let r = state.full(p, audio);
    if CANCEL.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("распознавание отменено".into());
    }
    r.map_err(|e| format!("распознавание не удалось: {e}"))?;
    let mut out = String::new();
    for i in 0..state.full_n_segments() {
        if let Some(seg) = state.get_segment(i) {
            out.push_str(&seg.to_str_lossy().unwrap_or_default());
        }
    }
    Ok(dedupe_repeats(out.trim()))
}

/// «Солотча, Солотча, Солотча…» → «Солотча»: оставить фразу до первого повтора.
pub fn dedupe_repeats(text: &str) -> String {
    let parts: Vec<&str> = text.split(|c| c == ',' || c == '.' || c == '!' || c == '?').map(str::trim).filter(|p| !p.is_empty()).collect();
    if parts.len() > 1 && parts.iter().skip(1).all(|p| p.eq_ignore_ascii_case(parts[0]) || parts[0].starts_with(p)) {
        return parts[0].to_string();
    }
    // повтор слов без знаков: «Тума Тума Тума»
    let words: Vec<&str> = text.split_whitespace().collect();
    for n in 1..=3usize.min(words.len() / 2) {
        if words.len() >= 2 * n && words[..n] == words[n..2 * n] {
            return words[..n].join(" ");
        }
    }
    text.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_48k_to_16k_keeps_duration() {
        let s: Vec<f32> = (0..48_000).map(|i| (i as f32 / 10.0).sin()).collect();
        let r = resample(&s, 48_000);
        assert!((r.len() as i64 - 16_000).abs() <= 1, "{}", r.len());
        assert_eq!(resample(&s[..100], 16_000).len(), 100);
    }

    #[test]
    fn speech_detection_and_russian_filter() {
        let quiet: Vec<f32> = (0..32_000).map(|i| 0.002 * ((i * 7919) % 13) as f32 / 13.0).collect();
        assert!(!has_speech(&quiet, 16_000), "ровный шум — не речь");
        let mut talk = quiet.clone();
        for (i, v) in talk[8_000..16_000].iter_mut().enumerate() { *v += 0.2 * ((i as f32) / 6.0).sin(); }
        assert!(has_speech(&talk, 16_000));
        assert!(plausible_russian("Поехали в Касимов."));
        assert!(plausible_russian("деревни у шмор"));
        assert!(!plausible_russian("Thank you for watching!"));
        assert!(!plausible_russian("..."));
        assert_eq!(dedupe_repeats("Солотча, Солотча, Солотча, Солотч"), "Солотча");
        assert_eq!(dedupe_repeats("Тума Тума Тума Тума Т"), "Тума");
        assert_eq!(dedupe_repeats("Поехали в Касимов. Поехали в Касимов. Поехали"), "Поехали в Касимов");
        assert_eq!(dedupe_repeats("деревни Ушмор, деревни Ушмор, деревни У"), "деревни Ушмор");
        assert_eq!(dedupe_repeats("Спас-Клепики"), "Спас-Клепики");
    }

    #[test]
    fn prepare_trims_silence_and_pads_short_phrase() {
        let mut s = vec![0.0f32; 16_000];
        s.extend((0..3_200).map(|i| 0.1 * ((i as f32) / 5.0).sin()));
        s.extend(vec![0.0f32; 16_000]);
        let p = prepare(s);
        assert_eq!(p.len(), 16_000, "фраза 0.2 с + поля → добита до секунды");
        assert!(p.iter().fold(0.0f32, |m, v| m.max(v.abs())) > 0.45, "громкость выровнена");
        assert!(prepare(vec![0.0; 32_000]).is_empty(), "одна тишина — пусто");
    }
}

#[cfg(test)]
mod model_tests {
    //! Сквозная проверка на настоящей модели: TND_VOICE_TEST_DIR=<папка с ggml-base-q5_1.bin и *.wav 16 кГц>
    //! cargo test voice_real -- --nocapture. Без переменной — пропускается.
    use super::*;

    #[test]
    fn voice_real_model_recognizes_place_names() {
        let Ok(dir) = std::env::var("TND_VOICE_TEST_DIR") else { return };
        let dir = PathBuf::from(dir);
        let _ = MODELS_DIR.set(dir.clone());
        let mut n = 0;
        for e in fs::read_dir(&dir).unwrap().flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("wav") { continue; }
            let mut r = hound::WavReader::open(&p).unwrap();
            let rate = r.spec().sample_rate;
            let s: Vec<f32> = r.samples::<i16>().map(|x| x.unwrap() as f32 / 32768.0).collect();
            let t = Instant::now();
            let text = transcribe(&prepare(resample(&s, rate)), Some("Солотча, Касимов, Спас-Клепики, Ушмор, Тума")).unwrap();
            println!("{}\t{:.2}s\t{text}", p.file_name().unwrap().to_string_lossy(), t.elapsed().as_secs_f32());
            assert!(!text.is_empty());
            n += 1;
        }
        assert!(n > 0);
    }
}
