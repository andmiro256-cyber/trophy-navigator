//! Linux: аппаратный композитинг WebKitGTK на проприетарном драйвере NVIDIA под Wayland.
//!
//! WebKitGTK 2.52 на связке NVIDIA + Wayland сам выбирает политику «never»: страница
//! сводится на CPU, и TrophyNav Maps/3D идут на 8–10 fps. С
//! `WEBKIT_FORCE_DMABUF_RENDERER=1 WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` композитинг
//! идёт на видеокарте (38–49 fps, HP, RTX 5060, драйвер 595, 07.10.2026). Одна
//! `WEBKIT_FORCE_DMABUF_RENDERER` без `FORCE_SHM` роняет веб-процесс (Wayland Error 71),
//! поэтому ставим только обе сразу. На X11 и других драйверах не проверено — не трогаем.

/// Явный отказ пользователя от подстройки: `TND_NO_GPU_TWEAKS=1`.
pub const OPT_OUT_VAR: &str = "TND_NO_GPU_TWEAKS";

/// Переменные, которые ставим вместе.
pub const TWEAK_VARS: [(&str, &str); 2] = [
    ("WEBKIT_FORCE_DMABUF_RENDERER", "1"),
    ("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1"),
];

/// Переменные рендерера WebKit: если пользователь задал любую из них, он управляет
/// рендерером сам, и мы ничего не добавляем (смесь чужих и наших значений непредсказуема).
pub const USER_RENDERER_VARS: [&str; 5] = [
    "WEBKIT_FORCE_DMABUF_RENDERER",
    "WEBKIT_DMABUF_RENDERER_FORCE_SHM",
    "WEBKIT_DISABLE_DMABUF_RENDERER",
    "WEBKIT_DISABLE_COMPOSITING_MODE",
    "WEBKIT_FORCE_COMPOSITING_MODE",
];

/// Факты окружения, от которых зависит решение.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GpuEnvFacts {
    pub linux: bool,
    /// Загружен проприетарный драйвер NVIDIA (`/proc/driver/nvidia/version` или `/sys/module/nvidia`).
    pub nvidia_proprietary: bool,
    /// `XDG_SESSION_TYPE`.
    pub session_type: Option<String>,
    /// `WAYLAND_DISPLAY` задан и не пуст.
    pub wayland_display: bool,
    /// `GDK_BACKEND`, если задан.
    pub gdk_backend: Option<String>,
    /// Пользователь сам задал хотя бы одну из `USER_RENDERER_VARS`.
    pub user_set_renderer_vars: bool,
    /// Значение `TND_NO_GPU_TWEAKS`.
    pub opt_out: Option<String>,
}

/// Решение: какие переменные выставить и почему.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GpuEnvDecision {
    pub set: Vec<(&'static str, &'static str)>,
    pub reason: &'static str,
}

fn opted_out(value: Option<&str>) -> bool {
    matches!(value.map(str::trim), Some(v) if !v.is_empty() && v != "0" && !v.eq_ignore_ascii_case("false"))
}

fn is_wayland(facts: &GpuEnvFacts) -> bool {
    // GDK_BACKEND=x11 переводит GTK на XWayland: там FORCE_DMABUF зависает («Failed to create GBM buffer»).
    if let Some(backend) = facts.gdk_backend.as_deref() {
        let backend = backend.trim();
        if !backend.is_empty()
            && !backend
                .split(',')
                .next()
                .unwrap_or("")
                .eq_ignore_ascii_case("wayland")
        {
            return false;
        }
    }
    facts
        .session_type
        .as_deref()
        .is_some_and(|t| t.trim().eq_ignore_ascii_case("wayland"))
        || facts.wayland_display
}

/// Чистая функция решения.
pub fn decide(facts: &GpuEnvFacts) -> GpuEnvDecision {
    let skip = |reason| GpuEnvDecision {
        set: Vec::new(),
        reason,
    };
    if !facts.linux {
        return skip("не Linux");
    }
    if opted_out(facts.opt_out.as_deref()) {
        return skip("TND_NO_GPU_TWEAKS задан — ничего не меняю");
    }
    if facts.user_set_renderer_vars {
        return skip("переменные рендерера WebKit заданы пользователем — не трогаю");
    }
    if !facts.nvidia_proprietary {
        return skip("драйвер NVIDIA не обнаружен");
    }
    if !is_wayland(facts) {
        return skip("NVIDIA без Wayland (X11 не проверен) — не трогаю");
    }
    GpuEnvDecision {
        set: TWEAK_VARS.to_vec(),
        reason: "NVIDIA + Wayland: включаю GPU-композитинг WebKit (DMA-BUF рендерер + SHM)",
    }
}

fn env_non_empty(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

/// Собирает факты из текущего окружения процесса.
pub fn collect_facts() -> GpuEnvFacts {
    GpuEnvFacts {
        linux: cfg!(target_os = "linux"),
        nvidia_proprietary: std::path::Path::new("/proc/driver/nvidia/version").exists()
            || std::path::Path::new("/sys/module/nvidia").exists(),
        session_type: env_non_empty("XDG_SESSION_TYPE"),
        wayland_display: env_non_empty("WAYLAND_DISPLAY").is_some(),
        gdk_backend: env_non_empty("GDK_BACKEND"),
        user_set_renderer_vars: USER_RENDERER_VARS
            .iter()
            .any(|name| std::env::var_os(name).is_some()),
        opt_out: std::env::var(OPT_OUT_VAR).ok(),
    }
}

/// Вызывать в самом начале `main`, до создания потоков и webview:
/// `std::env::set_var` небезопасен при параллельных потоках.
pub fn apply() {
    let facts = collect_facts();
    if !facts.linux {
        return;
    }
    let decision = decide(&facts);
    for (name, value) in &decision.set {
        std::env::set_var(name, value);
    }
    let vars = decision
        .set
        .iter()
        .map(|(n, v)| format!("{n}={v}"))
        .collect::<Vec<_>>()
        .join(" ");
    eprintln!(
        "[tnd gpu] {}{}{}",
        decision.reason,
        if vars.is_empty() { "" } else { ": " },
        vars
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nvidia_wayland() -> GpuEnvFacts {
        GpuEnvFacts {
            linux: true,
            nvidia_proprietary: true,
            session_type: Some("wayland".into()),
            wayland_display: true,
            ..Default::default()
        }
    }

    #[test]
    fn nvidia_wayland_sets_both_vars() {
        let d = decide(&nvidia_wayland());
        assert_eq!(
            d.set,
            vec![
                ("WEBKIT_FORCE_DMABUF_RENDERER", "1"),
                ("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1")
            ]
        );
    }

    #[test]
    fn wayland_display_alone_counts_as_wayland() {
        let facts = GpuEnvFacts {
            session_type: None,
            ..nvidia_wayland()
        };
        assert_eq!(decide(&facts).set.len(), 2);
        let facts = GpuEnvFacts {
            wayland_display: false,
            ..nvidia_wayland()
        };
        assert_eq!(decide(&facts).set.len(), 2);
    }

    #[test]
    fn nvidia_x11_is_left_alone() {
        let facts = GpuEnvFacts {
            session_type: Some("x11".into()),
            wayland_display: false,
            ..nvidia_wayland()
        };
        assert!(decide(&facts).set.is_empty());
    }

    #[test]
    fn gdk_backend_x11_on_wayland_is_left_alone() {
        let facts = GpuEnvFacts {
            gdk_backend: Some("x11".into()),
            ..nvidia_wayland()
        };
        assert!(decide(&facts).set.is_empty());
        let facts = GpuEnvFacts {
            gdk_backend: Some("wayland,x11".into()),
            ..nvidia_wayland()
        };
        assert_eq!(decide(&facts).set.len(), 2);
    }

    #[test]
    fn amd_or_intel_is_left_alone() {
        let facts = GpuEnvFacts {
            nvidia_proprietary: false,
            ..nvidia_wayland()
        };
        assert!(decide(&facts).set.is_empty());
    }

    #[test]
    fn user_renderer_vars_are_respected() {
        let facts = GpuEnvFacts {
            user_set_renderer_vars: true,
            ..nvidia_wayland()
        };
        assert!(decide(&facts).set.is_empty());
    }

    #[test]
    fn opt_out_is_respected() {
        for v in ["1", "yes", "true"] {
            let facts = GpuEnvFacts {
                opt_out: Some(v.into()),
                ..nvidia_wayland()
            };
            assert!(decide(&facts).set.is_empty(), "opt-out {v}");
        }
        for v in ["", "0", "false"] {
            let facts = GpuEnvFacts {
                opt_out: Some(v.into()),
                ..nvidia_wayland()
            };
            assert_eq!(decide(&facts).set.len(), 2, "not opt-out {v:?}");
        }
    }

    #[test]
    fn not_linux_is_left_alone() {
        let facts = GpuEnvFacts {
            linux: false,
            ..nvidia_wayland()
        };
        assert!(decide(&facts).set.is_empty());
    }
}
