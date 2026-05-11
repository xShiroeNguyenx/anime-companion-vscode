// Floating Desktop Companion — Tauri 2 sidecar for the Anime Companion VS Code
// extension. Runs out-of-process from VS Code, talks to the extension over
// WebSocket (host + token passed in via env vars). The Live2D runtime itself
// runs inside the webview, fetched over HTTP from the extension's bundled
// ModelFileServer.
//
// Lifecycle:
//   - extension's DesktopPetBridge spawns this binary with ANIME_PET_PORT +
//     ANIME_PET_TOKEN.
//   - main creates the floating window pointed at
//     http://127.0.0.1:{port}/desktop-pet/index.html?token={token}.
//   - tray menu lets the user toggle visibility / click-through, jump to
//     extension settings, and quit.
//   - on close-requested (titlebar X is hidden anyway, but Alt+F4 reaches
//     here), we hide rather than exit so the bridge can keep using the
//     existing window if the user re-opens it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

struct AppState {
    click_through: AtomicBool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct SavedWindowPosition {
    x: i32,
    y: i32,
}

// Apply click-through state to the floating window. Tauri's
// `set_ignore_cursor_events` toggles the WS_EX_TRANSPARENT bit, but on
// transparent + decorationless windows the OS often doesn't re-evaluate the
// style until something forces a frame change. Without that, clicks keep
// landing on the sidecar even with WS_EX_TRANSPARENT set. We force the
// re-evaluation by calling SetWindowPos with SWP_FRAMECHANGED right after.
fn apply_click_through(window: &tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        };
        if let Ok(handle) = window.hwnd() {
            let hwnd = handle.0 as HWND;
            unsafe {
                SetWindowPos(
                    hwnd,
                    std::ptr::null_mut(),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOACTIVATE,
                );
            }
        }
        eprintln!("[desktop-pet] apply_click_through ignore={}", ignore);
    }
    Ok(())
}

#[tauri::command]
fn set_click_through(window: tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    apply_click_through(&window, ignore)
}

fn build_window_url() -> Option<String> {
    let port = std::env::var("ANIME_PET_PORT").ok()?;
    let token = std::env::var("ANIME_PET_TOKEN").ok()?;
    if port.is_empty() || token.is_empty() {
        return None;
    }
    Some(format!(
        "http://127.0.0.1:{}/desktop-pet/index.html?token={}",
        port, token
    ))
}

fn initial_click_through_from_env() -> bool {
    match std::env::var("ANIME_PET_CLICK_THROUGH") {
        Ok(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => false,
    }
}

fn state_file_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("desktop-pet-window-position.json"))
}

fn load_saved_window_position<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<SavedWindowPosition> {
    let path = state_file_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    let parsed: SavedWindowPosition = serde_json::from_str(&raw).ok()?;
    println!(
        "[desktop-pet] Loaded saved window position x={} y={}",
        parsed.x, parsed.y
    );
    Some(parsed)
}

fn save_window_position<R: tauri::Runtime>(app: &tauri::AppHandle<R>, position: SavedWindowPosition) {
    let Some(path) = state_file_path(app) else {
        return;
    };

    let Some(parent) = path.parent() else {
        return;
    };

    if fs::create_dir_all(parent).is_err() {
        return;
    }

    let Ok(json) = serde_json::to_string(&position) else {
        return;
    };

    if fs::write(path, json).is_ok() {
        println!(
            "[desktop-pet] Saved window position x={} y={}",
            position.x, position.y
        );
    }
}

fn main() {
    let initial_click_through = initial_click_through_from_env();

    tauri::Builder::default()
        .manage(AppState {
            click_through: AtomicBool::new(initial_click_through),
        })
        .invoke_handler(tauri::generate_handler![set_click_through])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let url_str = build_window_url().ok_or_else(|| {
                "ANIME_PET_PORT / ANIME_PET_TOKEN env vars are required. \
                The Anime Companion VS Code extension sets these when spawning the sidecar."
                    .to_string()
            })?;

            let url = url_str
                .parse()
                .map_err(|e: url::ParseError| e.to_string())?;

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Anime Companion - Desktop Companion")
                .inner_size(300.0, 420.0)
                .min_inner_size(220.0, 300.0)
                .transparent(true)
                .decorations(false)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .build()?;

            let _ = window.set_shadow(false);
            let _ = apply_click_through(&window, initial_click_through);
            if let Some(saved) = load_saved_window_position(&app_handle) {
                println!(
                    "[desktop-pet] Restoring saved position x={} y={}",
                    saved.x, saved.y
                );
                let _ = window.set_position(tauri::PhysicalPosition::new(saved.x, saved.y));
            } else if let Some(monitor) = window.current_monitor()?.or(app_handle.primary_monitor()?) {
                let monitor_pos = monitor.position();
                let monitor_size = monitor.size();
                let window_size = window.outer_size()?;
                let x = monitor_pos.x + 8;
                let y = monitor_pos.y + monitor_size.height as i32 - window_size.height as i32 - 8;
                println!(
                    "[desktop-pet] Using default dock position x={} y={}",
                    x, y
                );
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }

            let show_item = MenuItem::with_id(app, "toggle_show", "Show / Hide", true, None::<&str>)?;
            let click_through_item = MenuItem::with_id(
                app,
                "click_through",
                "Toggle Click-through",
                true,
                None::<&str>,
            )?;
            let settings_item =
                MenuItem::with_id(app, "settings", "Open Extension Settings", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &click_through_item,
                    &settings_item,
                    &quit_item,
                ],
            )?;

            // Tray icon. include_bytes! resolves relative to this file —
            // ../../media/icon.png points at the extension's existing icon.
            let icon = tauri::image::Image::from_bytes(include_bytes!("../../media/icon.png"))?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("Anime Companion")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle_show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let visible = w.is_visible().unwrap_or(false);
                            if visible {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                    "click_through" => {
                        let state: tauri::State<AppState> = app.state();
                        let new_value = !state.click_through.load(Ordering::SeqCst);
                        state.click_through.store(new_value, Ordering::SeqCst);
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = apply_click_through(&w, new_value);
                        }
                    }
                    "settings" => {
                        // Renderer holds the WS connection back to the extension;
                        // tell it to send the runCommand for openSettings.
                        let _ = app.emit("anime-pet:open-settings", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of exiting. Bridge owns the lifecycle; user
                // exits via tray Quit.
                api.prevent_close();
                let _ = window.hide();
            } else if let WindowEvent::Moved(position) = event {
                println!(
                    "[desktop-pet] Window moved to x={} y={}",
                    position.x, position.y
                );
                save_window_position(
                    &window.app_handle(),
                    SavedWindowPosition {
                        x: position.x,
                        y: position.y,
                    },
                );
            }
        })
        .run(tauri::generate_context!())
        .expect("Tauri start failed");
}
