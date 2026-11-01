//go:build windows

package main

import (
	"os"
	"runtime"
	"testing"
	"unsafe"
)

func TestMain(m *testing.M) {
	runtime.LockOSThread()
	coInitialize.Call(0, coinitMTA)
	os.Exit(m.Run())
}

// The layouts Windows reads straight from memory.
func TestLayouts(t *testing.T) {
	if size := unsafe.Sizeof(guid{}); size != 16 {
		t.Errorf("a GUID is %d bytes", size)
	}
	if size := unsafe.Sizeof(propertyKey{}); size != 20 {
		t.Errorf("a PROPERTYKEY is %d bytes", size)
	}
	if size := unsafe.Sizeof([3]uintptr{}); size != 24 {
		t.Errorf("a PROPVARIANT is %d bytes", size)
	}
}

func TestEveryObjectCanBeMade(t *testing.T) {
	if err := selfCheck(); err != nil {
		t.Fatal(err)
	}
}

func TestListingDevicesWorksWithNothingPluggedIn(t *testing.T) {
	devices, err := listDevices()
	if err != nil {
		t.Fatal(err)
	}
	if devices == nil {
		t.Error("the list should be empty, not missing, so it reaches JSON as []")
	}
}

func TestValuesKeepWhatTheyAreGiven(t *testing.T) {
	values, err := newValues()
	if err != nil {
		t.Fatal(err)
	}
	defer values.release()
	if err := setString(values, &keyName, "Žluťoučký kůň 😀"); err != nil {
		t.Fatal(err)
	}
	if got := getString(values, &keyName); got != "Žluťoučký kůň 😀" {
		t.Errorf("string came back as %q", got)
	}
	if err := setGuid(values, &keyContentType, &typeFolder); err != nil {
		t.Fatal(err)
	}
	if got, ok := getGuid(values, &keyContentType); !ok || got != typeFolder {
		t.Errorf("GUID came back as %v", got)
	}
	if err := check("SetUint64", values.call(valSetUint64, ptr(&keySize), 5_000_000_000)); err != nil {
		t.Fatal(err)
	}
	if got := getUint64(values, &keySize); got != 5_000_000_000 {
		t.Errorf("number came back as %d", got)
	}
	if got := getString(values, &keyParent); got != "" {
		t.Errorf("a value never set came back as %q", got)
	}
}

func TestAnIdGoesIntoACollection(t *testing.T) {
	ids, err := create(&clsidVariants, &iidVariants)
	if err != nil {
		t.Fatal(err)
	}
	defer ids.release()
	var variant [3]uintptr
	*(*uint16)(unsafe.Pointer(&variant[0])) = vtLPWSTR
	variant[1] = ptr(wide("o123"))
	if err := check("Add", ids.call(variantsAdd, ptr(&variant))); err != nil {
		t.Fatal(err)
	}
	var count uint32
	if err := check("GetCount", ids.call(3, ptr(&count))); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("collection holds %d", count)
	}
}

func TestNothingWorksBeforeOpening(t *testing.T) {
	var s session
	for _, cmd := range []string{"storages", "children", "mkdir", "send", "fetch", "read", "delete"} {
		if _, err := s.handle(cmd, arguments{}, func(uint64) {}); err == nil {
			t.Errorf("%s worked with no device open", cmd)
		}
	}
}

func TestAnUnknownCommandIsAnError(t *testing.T) {
	s := session{device: 1}
	defer func() { s = session{} }()
	if _, err := s.handle("nonsense", arguments{}, func(uint64) {}); err == nil {
		t.Error("nonsense was accepted")
	}
}

func TestClosingTwiceIsFine(t *testing.T) {
	var s session
	s.close()
	s.close()
}

func TestOpeningADeviceThatIsntThereFails(t *testing.T) {
	var s session
	defer s.close()
	if err := s.open(`\\?\usb#vid_1949&pid_0000#none#{6ac27878-a6fa-4155-ba85-f98f491d4f33}`); err == nil {
		t.Error("opened a device that doesn't exist")
	}
	if s.device != 0 {
		t.Error("kept hold of a device that failed to open")
	}
}

func TestWideNeverFailsOnANul(t *testing.T) {
	if p := wide("a\x00b"); p == nil {
		t.Error("no string")
	}
}

func TestReadingPartOfAFileRefusesNonsense(t *testing.T) {
	var s session
	for _, c := range [][2]int{{-1, 5}, {5, -1}, {longestSkip + 1, 5}, {0, longestSkip + 1}} {
		if got, err := s.read("x", c[0], c[1]); got != nil || err != nil {
			t.Errorf("read(%d, %d) gave %v, %v", c[0], c[1], got, err)
		}
	}
}
