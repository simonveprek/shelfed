//go:build windows

// Command installer is Shelfed's installer for Windows: a small window in
// Shelfed's own look that installs it and opens it.
//
// The work is done by the installer electron-builder makes, carried inside this
// one as payload/setup.exe and run silently. Updates run that same installer
// silently too, so this window is only ever seen on a first install. Without
// WebView2, which Windows 10 and 11 normally have, the plain installer runs
// instead.
package main

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/jchv/go-webview2/pkg/edge"
	"github.com/jchv/go-webview2/webviewloader"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

//go:embed ui.html
var page string

//go:embed geist.woff2
var font []byte

//go:embed payload
var payload embed.FS

// Set when built: the version, and how many bytes Shelfed takes once installed.
var (
	version = "dev"
	size    = "300000000"
)

// The window, in points before Windows scales it to the screen.
const width, height = 440, 320

var (
	user32  = windows.NewLazySystemDLL("user32.dll")
	dwmapi  = windows.NewLazySystemDLL("dwmapi.dll")
	kernel  = windows.NewLazySystemDLL("kernel32.dll")
	call    = func(dll *windows.LazyDLL, name string, args ...uintptr) uintptr {
		r, _, _ := dll.NewProc(name).Call(args...)
		return r
	}
)

const (
	wmDestroy      = 0x0002
	wmMove         = 0x0003
	wmSize         = 0x0005
	wmActivate     = 0x0006
	wmClose        = 0x0010
	wmNcCalcSize   = 0x0083
	wmNcLButtonDn  = 0x00A1
	wmSetIcon      = 0x0080
	wmRun          = 0x8001 // WM_APP + 1: run what the other threads queued
	htCaption      = 2
	swHide         = 0
	swShow         = 5
	swMinimize     = 6
	wsPopup        = 0x80000000
	wsCaption      = 0x00C00000
	wsSysMenu      = 0x00080000
	wsMinimizeBox  = 0x00020000
	wsExAppWindow  = 0x00040000
	spiGetWorkArea = 0x0030
)

type rect struct{ Left, Top, Right, Bottom int32 }

type msg struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      struct{ X, Y int32 }
}

type wndClass struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSm     uintptr
}

var (
	hwnd    uintptr
	browser *edge.Chromium
	setup   string

	queue   []func()
	queueMu sync.Mutex

	state struct {
		sync.Mutex
		installing bool
		leaving    bool
		started    bool
	}
)

func main() {
	runtime.LockOSThread()
	// Sharp on every screen, at whatever scale Windows uses.
	call(user32, "SetProcessDpiAwarenessContext", ^uintptr(3)) // PER_MONITOR_AWARE_V2

	dir, err := os.MkdirTemp("", "shelfed-setup-")
	if err != nil {
		fail("Shelfed couldn't be unpacked: " + err.Error())
		return
	}
	defer os.RemoveAll(dir)
	setup = filepath.Join(dir, "setup.exe")
	data, err := fs.ReadFile(payload, "payload/setup.exe")
	if err == nil {
		err = os.WriteFile(setup, data, 0o755)
	}
	if err != nil {
		fail("This installer has no Shelfed inside it. Download it again from shelfed.simonveprek.cz.")
		return
	}

	// No WebView2: the plain installer does it all, as it would on its own.
	if _, err := webviewloader.GetInstalledVersion(); err != nil {
		_ = exec.Command(setup).Run()
		return
	}

	open(filepath.Join(dir, "webview"))
	loop()
}

/* ------------------------------------------------------------------------ */
/* The window                                                                */
/* ------------------------------------------------------------------------ */

func open(data string) {
	instance := call(kernel, "GetModuleHandleW", 0)
	class, _ := windows.UTF16PtrFromString("ShelfedSetup")
	// The icon built into this file, Shelfed's.
	appName, _ := windows.UTF16PtrFromString("APP")
	icon := call(user32, "LoadImageW", instance, uintptr(unsafe.Pointer(appName)), 1, 0, 0, 0x8040) // IMAGE_ICON, LR_DEFAULTSIZE|LR_SHARED
	if icon == 0 {
		icon = call(user32, "LoadImageW", instance, 1, 1, 0, 0, 0x8040)
	}
	call(user32, "RegisterClassExW", uintptr(unsafe.Pointer(&wndClass{
		Size:      uint32(unsafe.Sizeof(wndClass{})),
		WndProc:   windows.NewCallback(wndproc),
		Instance:  instance,
		Icon:      icon,
		IconSm:    icon,
		Cursor:    call(user32, "LoadCursorW", 0, 32512), // the arrow
		ClassName: class,
	})))

	// The size in points, scaled for the screen, in the middle of it.
	dpi := call(user32, "GetDpiForSystem")
	if dpi == 0 {
		dpi = 96
	}
	w, h := int32(width*dpi/96), int32(height*dpi/96)
	var area rect
	call(user32, "SystemParametersInfoW", spiGetWorkArea, 0, uintptr(unsafe.Pointer(&area)), 0)
	x, y := area.Left+(area.Right-area.Left-w)/2, area.Top+(area.Bottom-area.Top-h)/2

	title, _ := windows.UTF16PtrFromString("Shelfed")
	// A caption in the style keeps Windows' shadow, its animations and the
	// taskbar menu; wndproc gives that caption's room to the page.
	hwnd = call(user32, "CreateWindowExW", wsExAppWindow, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)),
		wsPopup|wsCaption|wsSysMenu|wsMinimizeBox, uintptr(x), uintptr(y), uintptr(w), uintptr(h), 0, 0, instance, 0)
	call(user32, "SendMessageW", hwnd, wmSetIcon, 0, icon)
	call(user32, "SendMessageW", hwnd, wmSetIcon, 1, icon)

	dark := darkMode()
	// Windows 11: rounded corners, and a border drawn for light or dark.
	round, on := uint32(2), uint32(0)
	if dark {
		on = 1
	}
	call(dwmapi, "DwmSetWindowAttribute", hwnd, 33, uintptr(unsafe.Pointer(&round)), 4) // DWMWA_WINDOW_CORNER_PREFERENCE
	call(dwmapi, "DwmSetWindowAttribute", hwnd, 20, uintptr(unsafe.Pointer(&on)), 4)    // DWMWA_USE_IMMERSIVE_DARK_MODE
	margins := [4]int32{0, 0, 1, 0}
	call(dwmapi, "DwmExtendFrameIntoClientArea", hwnd, uintptr(unsafe.Pointer(&margins)))
	// Apply the frame change before anything is drawn.
	call(user32, "SetWindowPos", hwnd, 0, 0, 0, 0, 0, 0x0027) // SWP_NOSIZE|SWP_NOMOVE|SWP_NOZORDER|SWP_FRAMECHANGED

	browser = edge.NewChromium()
	browser.DataPath = data
	browser.MessageCallback = heard
	browser.NavigationCompletedCallback = func(*edge.ICoreWebView2, *edge.ICoreWebView2NavigationCompletedEventArgs) {
		// Shown once the page has drawn, so it never flashes white first.
		call(user32, "ShowWindow", hwnd, swShow)
		call(user32, "SetForegroundWindow", hwnd)
		state.Lock()
		first := !state.started
		state.started = true
		state.Unlock()
		if first {
			go install()
		}
	}
	if !browser.Embed(hwnd) {
		call(user32, "DestroyWindow", hwnd)
		_ = exec.Command(setup).Run()
		os.Exit(0)
	}
	if settings, err := browser.GetSettings(); err == nil {
		_ = settings.PutAreDefaultContextMenusEnabled(false)
		_ = settings.PutAreDevToolsEnabled(false)
		_ = settings.PutIsStatusBarEnabled(false)
		_ = settings.PutIsZoomControlEnabled(false)
	}
	if controller := browser.GetController().GetICoreWebView2Controller2(); controller != nil {
		color := edge.COREWEBVIEW2_COLOR{A: 255, R: 0xf6, G: 0xf5, B: 0xf1}
		if dark {
			color = edge.COREWEBVIEW2_COLOR{A: 255, R: 0x11, G: 0x11, B: 0x11}
		}
		_ = controller.PutDefaultBackgroundColor(color)
	}
	browser.Resize()
	quoted, _ := json.Marshal(version)
	browser.Init("window.SHELFED_VERSION=" + string(quoted))
	html := strings.Replace(page, `url("geist.woff2")`, `url("data:font/woff2;base64,`+base64.StdEncoding.EncodeToString(font)+`")`, 1)
	browser.NavigateToString(html)
}

func wndproc(window, message, wparam, lparam uintptr) uintptr {
	switch message {
	case wmNcCalcSize:
		// The whole window is the page: no title bar, no border.
		if wparam != 0 {
			return 0
		}
	case wmSize:
		if browser != nil {
			browser.Resize()
		}
	case wmMove:
		if browser != nil {
			_ = browser.NotifyParentWindowPositionChanged()
		}
	case wmActivate:
		if browser != nil && wparam != 0 {
			browser.Focus()
		}
	case wmRun:
		queueMu.Lock()
		jobs := queue
		queue = nil
		queueMu.Unlock()
		for _, job := range jobs {
			job()
		}
		return 0
	case wmClose:
		call(user32, "DestroyWindow", window)
		return 0
	case wmDestroy:
		call(user32, "PostQuitMessage", 0)
		return 0
	}
	return call(user32, "DefWindowProcW", window, message, wparam, lparam)
}

func loop() {
	var m msg
	for call(user32, "GetMessageW", uintptr(unsafe.Pointer(&m)), 0, 0, 0) > 0 {
		call(user32, "TranslateMessage", uintptr(unsafe.Pointer(&m)))
		call(user32, "DispatchMessageW", uintptr(unsafe.Pointer(&m)))
	}
}

// onWindow runs a step on the window's own thread, where WebView2 wants it.
func onWindow(job func()) {
	queueMu.Lock()
	queue = append(queue, job)
	queueMu.Unlock()
	call(user32, "PostMessageW", hwnd, wmRun, 0, 0)
}

// show runs a line of the page's script: setState, setProgress.
func show(script string) { onWindow(func() { browser.Eval(script) }) }

// heard is what the page's buttons say.
func heard(message string) {
	switch message {
	case "drag":
		call(user32, "ReleaseCapture")
		call(user32, "PostMessageW", hwnd, wmNcLButtonDn, htCaption, 0)
	case "minimise":
		call(user32, "ShowWindow", hwnd, swMinimize)
	case "quit":
		state.Lock()
		defer state.Unlock()
		// Closed halfway, the install still finishes, out of sight, rather than leave half a Shelfed behind.
		if state.installing {
			state.leaving = true
			call(user32, "ShowWindow", hwnd, swHide)
			return
		}
		call(user32, "PostMessageW", hwnd, wmClose, 0, 0)
	case "retry":
		go install()
	}
}

/* ------------------------------------------------------------------------ */
/* Installing                                                                */
/* ------------------------------------------------------------------------ */

func install() {
	state.Lock()
	if state.installing {
		state.Unlock()
		return
	}
	state.installing = true
	state.Unlock()
	finished := func() {
		state.Lock()
		state.installing = false
		state.Unlock()
	}

	show(`setState("installing"); setProgress(0)`)
	folder := installedAt()
	if running(filepath.Join(folder, "Shelfed.exe")) {
		finished()
		show(`setState("open")`)
		return
	}

	total, _ := strconv.ParseFloat(size, 64)
	start := time.Now()
	// Installing over an older Shelfed first takes the old one away, so the
	// folder only counts once it has emptied.
	emptied := folderSize(folder) < total*0.2

	cmd := exec.Command(setup, "/S")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	done := make(chan error, 1)
	if err := cmd.Start(); err != nil {
		finished()
		show(fmt.Sprintf(`setState("failed", %q)`, "Shelfed couldn't be installed: "+err.Error()))
		return
	}
	go func() { done <- cmd.Wait() }()

	shown := 0.0
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	var err error
wait:
	for {
		select {
		case err = <-done:
			break wait
		case <-ticker.C:
			now := folderSize(folder)
			if !emptied && now < total*0.2 {
				emptied = true
			}
			share := 0.04 * min(1, time.Since(start).Seconds()/4)
			if emptied && total > 0 {
				share = max(share, min(0.96, now/total))
			}
			if share > shown {
				shown = share
				show(fmt.Sprintf("setProgress(%.3f)", shown))
			}
		}
	}

	if err != nil {
		finished()
		if running(filepath.Join(installedAt(), "Shelfed.exe")) {
			show(`setState("open")`)
			return
		}
		var exit *exec.ExitError
		code := ""
		if errors.As(err, &exit) {
			code = fmt.Sprintf(" (code %d)", exit.ExitCode())
		}
		show(fmt.Sprintf(`setState("failed", %q)`, "Shelfed couldn't be installed"+code+"."))
		return
	}

	show(`setProgress(1)`)
	time.Sleep(450 * time.Millisecond)
	state.Lock()
	leaving := state.leaving
	state.Unlock()
	if !leaving {
		show(`setState("ready")`)
		time.Sleep(1400 * time.Millisecond)
		app := exec.Command(filepath.Join(installedAt(), "Shelfed.exe"))
		_ = app.Start()
	}
	finished()
	call(user32, "PostMessageW", hwnd, wmClose, 0, 0)
}

// installedAt is the folder Shelfed is installed in, or goes into: where an
// earlier install says it is, or where a new one goes for this user.
func installedAt() string {
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		base, err := registry.OpenKey(root, `Software\Microsoft\Windows\CurrentVersion\Uninstall`, registry.ENUMERATE_SUB_KEYS)
		if err != nil {
			continue
		}
		names, _ := base.ReadSubKeyNames(-1)
		base.Close()
		for _, name := range names {
			key, err := registry.OpenKey(root, `Software\Microsoft\Windows\CurrentVersion\Uninstall\`+name, registry.QUERY_VALUE)
			if err != nil {
				continue
			}
			display, _, _ := key.GetStringValue("DisplayName")
			uninstall, _, _ := key.GetStringValue("UninstallString")
			key.Close()
			if !strings.HasPrefix(display, "Shelfed") || uninstall == "" {
				continue
			}
			// "C:\...\Shelfed\Uninstall Shelfed.exe" /currentuser
			if path := strings.Trim(strings.SplitN(strings.TrimPrefix(uninstall, `"`), `"`, 2)[0], " "); path != "" {
				return filepath.Dir(path)
			}
		}
	}
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Shelfed")
}

// running says whether Shelfed is open: Windows won't let a running program's
// file be opened for writing.
func running(exe string) bool {
	if _, err := os.Stat(exe); err != nil {
		return false
	}
	file, err := os.OpenFile(exe, os.O_WRONLY, 0)
	if err != nil {
		return true
	}
	file.Close()
	return false
}

func folderSize(folder string) float64 {
	var total int64
	_ = filepath.WalkDir(folder, func(_ string, entry fs.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			if info, err := entry.Info(); err == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return float64(total)
}

func darkMode() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer key.Close()
	light, _, err := key.GetIntegerValue("AppsUseLightTheme")
	return err == nil && light == 0
}

func fail(text string) {
	title, _ := windows.UTF16PtrFromString("Shelfed")
	body, _ := windows.UTF16PtrFromString(text)
	call(user32, "MessageBoxW", 0, uintptr(unsafe.Pointer(body)), uintptr(unsafe.Pointer(title)), 0x10) // MB_ICONERROR
}
