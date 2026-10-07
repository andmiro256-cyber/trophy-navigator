//! Щипок тачпада (Linux, WebKitGTK): не масштабировать страницу, а зумить карту.
//!
//! WebKitGTK сам обрабатывает `GDK_TOUCHPAD_PINCH` в обработчике класса сигнала `event`
//! (WebKitWebViewBase) и масштабирует всю страницу — кнопки и панели растут, как page zoom.
//! В JS этот жест не виден (GestureEvent в WebKitGTK нет), отменить его со страницы нельзя.
//! Поэтому перехватываем событие раньше (наш обработчик `event` идёт до обработчика класса,
//! сигнал RUN_LAST), останавливаем его и передаём странице: `window.tndPinch(phase, scale, x, y)`.
//! Остальные события (колесо, мышь, клавиатура) не трогаем.

/// Фаза жеста GDK: 0 begin, 1 update, 2 end, 3 cancel.
/// Возвращает вызов для страницы или None, если данные испорчены.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn pinch_js(phase: i32, scale: f64, x: f64, y: f64) -> Option<String> {
    if !(0..=3).contains(&phase) || !scale.is_finite() || !x.is_finite() || !y.is_finite() {
        return None;
    }
    // scale — относительно начала жеста; 0 бывает в cancel — тогда без масштаба
    let scale = if scale > 0.0 { scale } else { 1.0 };
    Some(format!(
        "window.tndPinch && window.tndPinch({phase}, {scale:.5}, {x:.1}, {y:.1});"
    ))
}

#[cfg(target_os = "linux")]
pub fn install<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let target = window.clone();
    let result = window.with_webview(move |platform| {
        use gtk::glib::translate::ToGlibPtr;
        use gtk::prelude::*;
        let webview = platform.inner();
        webview.connect_event(move |_, event| {
            if event.event_type() != gtk::gdk::EventType::TouchpadPinch {
                return gtk::glib::Propagation::Proceed;
            }
            if let Some(pinch) = event.downcast_ref::<gtk::gdk::EventTouchpadPinch>() {
                let raw: *const gtk::gdk::ffi::GdkEventTouchpadPinch = pinch.to_glib_none().0;
                // SAFETY: указатель на живое событие на время обработчика; читаем одно поле
                let phase = unsafe { (*raw).phase } as i32;
                let (x, y) = pinch.position();
                if let Some(js) = pinch_js(phase, pinch.scale(), x, y) {
                    let _ = target.eval(&js);
                }
            }
            // Страницу WebKit не масштабирует никогда
            gtk::glib::Propagation::Stop
        });
    });
    if let Err(e) = result {
        eprintln!("[tnd pinch] не удалось подключить обработчик щипка: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phases_scale_and_position_reach_the_page() {
        assert_eq!(
            pinch_js(1, 1.5, 100.0, 200.25).as_deref(),
            Some("window.tndPinch && window.tndPinch(1, 1.50000, 100.0, 200.2);")
        );
        assert!(pinch_js(0, 1.0, 0.0, 0.0).is_some());
        assert!(pinch_js(3, 0.0, 1.0, 1.0).unwrap().contains("(3, 1.00000,"));
    }

    #[test]
    fn broken_events_are_dropped() {
        assert!(pinch_js(4, 1.0, 0.0, 0.0).is_none());
        assert!(pinch_js(-1, 1.0, 0.0, 0.0).is_none());
        assert!(pinch_js(1, f64::NAN, 0.0, 0.0).is_none());
        assert!(pinch_js(1, 1.0, f64::INFINITY, 0.0).is_none());
    }
}
