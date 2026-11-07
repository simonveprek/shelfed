//go:build windows

// A small helper for Shelfed on Windows. Windows gives MTP devices, such as
// Kindles from 2024 on, to its own driver, so programs reach them through the
// Windows Portable Devices service, a COM API. This speaks that API and takes
// its orders as lines of JSON on stdin, answering on stdout:
//
//	{"id":1,"cmd":"devices","args":{}}   ->   {"id":1,"ok":true,"result":[...]}
//
// A long job also sends {"id":1,"done":12345} as it goes. It uses nothing but
// Go's own standard library, and calls COM through each object's table of
// methods, whose order comes from the Windows SDK headers.
package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

type guid struct {
	a uint32
	b uint16
	c uint16
	d [8]byte
}

type propertyKey struct {
	fmtid guid
	pid   uint32
}

var (
	clsidManager       = guid{0x0af10cec, 0x2ecd, 0x4b92, [8]byte{0x95, 0x81, 0x34, 0xf6, 0xae, 0x06, 0x37, 0xf3}}
	iidManager         = guid{0xa1567595, 0x4c2f, 0x4574, [8]byte{0xa6, 0xfa, 0xec, 0xef, 0x91, 0x7b, 0x9a, 0x40}}
	clsidDeviceFTM     = guid{0xf7c0039a, 0x4762, 0x488a, [8]byte{0xb4, 0xb3, 0x76, 0x0e, 0xf9, 0xa1, 0xba, 0x9b}}
	iidDevice          = guid{0x625e2df8, 0x6392, 0x4cf0, [8]byte{0x9a, 0xd1, 0x3c, 0xfa, 0x5f, 0x17, 0x77, 0x5c}}
	clsidValues        = guid{0x0c15d503, 0xd017, 0x47ce, [8]byte{0x90, 0x16, 0x7b, 0x3f, 0x97, 0x87, 0x21, 0xcc}}
	iidValues          = guid{0x6848f6f2, 0x3155, 0x4f86, [8]byte{0xb6, 0xf5, 0x26, 0x3e, 0xee, 0xab, 0x31, 0x43}}
	clsidKeys          = guid{0xde2d022d, 0x2480, 0x43be, [8]byte{0x97, 0xf0, 0xd1, 0xfa, 0x2c, 0xf9, 0x8f, 0x4f}}
	iidKeys            = guid{0xdada2357, 0xe0ad, 0x492e, [8]byte{0x98, 0xdb, 0xdd, 0x61, 0xc5, 0x3b, 0xa3, 0x53}}
	clsidVariants      = guid{0x08a99e2f, 0x6d6d, 0x4b80, [8]byte{0xaf, 0x5a, 0xba, 0xf2, 0xbc, 0xbe, 0x4c, 0xb9}}
	iidVariants        = guid{0x89b2e422, 0x4f1b, 0x4316, [8]byte{0xbc, 0xef, 0xa4, 0x4a, 0xfe, 0xa8, 0x3e, 0xb3}}
	iidDataStream      = guid{0x88e04db3, 0x1012, 0x4d64, [8]byte{0x99, 0x96, 0xf7, 0x03, 0xa9, 0x50, 0xd3, 0xf4}}
	typeFunctional     = guid{0x99ed0160, 0x17ff, 0x4c44, [8]byte{0x9d, 0x98, 0x1d, 0x7a, 0x6f, 0x94, 0x19, 0x21}}
	typeFolder         = guid{0x27e2e392, 0xa111, 0x48e0, [8]byte{0xab, 0x0c, 0xe1, 0x77, 0x05, 0xa0, 0x5f, 0x85}}
	typeGenericFile    = guid{0x0085e0a6, 0x8d34, 0x45d7, [8]byte{0xbc, 0x5c, 0x44, 0x7e, 0x59, 0xc7, 0x3d, 0x48}}
	categoryStorage    = guid{0x23f05bbc, 0x15de, 0x4c2a, [8]byte{0xa5, 0x5b, 0xa9, 0xaf, 0x5c, 0xe4, 0x12, 0xef}}
	formatPropsOnly    = guid{0x30010000, 0xae6c, 0x4804, [8]byte{0x98, 0xba, 0xc5, 0x7b, 0x46, 0x96, 0x5f, 0xe7}}
	formatUnspecified  = guid{0x30000000, 0xae6c, 0x4804, [8]byte{0x98, 0xba, 0xc5, 0x7b, 0x46, 0x96, 0x5f, 0xe7}}
	objectFamily       = guid{0xef6b490d, 0x5cd8, 0x437a, [8]byte{0xaf, 0xfc, 0xda, 0x8b, 0x60, 0xee, 0x4a, 0x3c}}
	storageFamily      = guid{0x01a3057a, 0x74d6, 0x4e80, [8]byte{0xbe, 0xa7, 0xdc, 0x4c, 0x21, 0x2c, 0xe5, 0x0a}}
	clientFamily       = guid{0x204d9f0c, 0x2292, 0x4080, [8]byte{0x9f, 0x42, 0x40, 0x66, 0x4e, 0x70, 0xf8, 0x59}}
	keyParent          = propertyKey{objectFamily, 3}
	keyName            = propertyKey{objectFamily, 4}
	keyFormat          = propertyKey{objectFamily, 6}
	keyContentType     = propertyKey{objectFamily, 7}
	keySize            = propertyKey{objectFamily, 11}
	keyOriginalName    = propertyKey{objectFamily, 12}
	keyCategory        = propertyKey{guid{0x8f052d93, 0xabca, 0x4fc5, [8]byte{0xa5, 0xac, 0xb0, 0x1d, 0xf4, 0xdb, 0xe5, 0x98}}, 2}
	keyCapacity        = propertyKey{storageFamily, 4}
	keyFree            = propertyKey{storageFamily, 5}
	keyDescription     = propertyKey{storageFamily, 7}
	keyClientName      = propertyKey{clientFamily, 2}
	keyClientMajor     = propertyKey{clientFamily, 3}
	keyClientMinor     = propertyKey{clientFamily, 4}
	keyClientRevision  = propertyKey{clientFamily, 5}
	keyClientSecurity  = propertyKey{clientFamily, 8}
	keyResourceDefault = propertyKey{guid{0xe81e79be, 0x34f0, 0x41bf, [8]byte{0xb5, 0x3f, 0xf1, 0xa0, 0x6a, 0xe8, 0x78, 0x42}}, 0}
)

// Places in each object's table of methods. The first three are always
// QueryInterface, AddRef and Release.
const (
	mRelease = 2
	mQI      = 0

	mgrGetDevices    = 3
	mgrRefresh       = 4
	mgrFriendlyName  = 5
	devOpen          = 3
	devContent       = 5
	devClose         = 8
	contEnum         = 3
	contProperties   = 4
	contTransfer     = 5
	contCreateProps  = 6
	contCreateData   = 7
	contDelete       = 8
	enumNext         = 3
	propsGetValues   = 5
	resGetStream     = 5
	streamRead       = 3
	streamWrite      = 4
	streamCommit     = 8
	streamRevert     = 9
	dataGetObjectID  = 14
	valSetString     = 7
	valGetString     = 8
	valSetUint       = 9
	valSetUint64     = 13
	valGetUint64     = 14
	valSetGuid       = 27
	valGetGuid       = 28
	keysAdd          = 5
	variantsAdd      = 5
)

const (
	clsctxInproc      = 1
	coinitMTA         = 0
	securityImperson  = 0x00020000
	deleteRecursive   = 1
	vtLPWSTR          = 31
	readChunk         = 256 * 1024
	progressEveryByte = 512 * 1024
	// As far into a file as it's worth reading just to look at part of it.
	longestSkip = 8 * 1024 * 1024
	// The most objects one folder may list. What a device says is never taken on trust.
	mostObjects = 100000
)

var (
	ole32           = syscall.NewLazyDLL("ole32.dll")
	coInitialize    = ole32.NewProc("CoInitializeEx")
	coCreate        = ole32.NewProc("CoCreateInstance")
	coTaskMemFree   = ole32.NewProc("CoTaskMemFree")
)

type object uintptr

func (o object) call(method int, args ...uintptr) uintptr {
	table := *(*uintptr)(unsafe.Pointer(uintptr(o)))
	fn := *(*uintptr)(unsafe.Pointer(table + uintptr(method)*unsafe.Sizeof(uintptr(0))))
	r, _, _ := syscall.SyscallN(fn, append([]uintptr{uintptr(o)}, args...)...)
	unpin()
	return r
}

func (o object) release() {
	if o != 0 {
		o.call(mRelease)
	}
}

func failed(hr uintptr) bool { return int32(hr) < 0 }

func check(what string, hr uintptr) error {
	if failed(hr) {
		return fmt.Errorf("%s failed: 0x%08x", what, uint32(hr))
	}
	return nil
}

func create(clsid, iid *guid) (object, error) {
	var out object
	hr, _, _ := coCreate.Call(ptr(clsid), 0, clsctxInproc, ptr(iid), ptr(&out))
	unpin()
	return out, check("CoCreateInstance", hr)
}

func wide(s string) *uint16 {
	p, err := syscall.UTF16PtrFromString(strings.ReplaceAll(s, "\x00", ""))
	if err != nil {
		empty := uint16(0)
		return &empty
	}
	return p
}

// What's been handed to Windows as a bare address. Being held here keeps each
// one on the heap, where it can't move, and alive until the call has returned.
var pinned []any

func ptr[T any](p *T) uintptr {
	pinned = append(pinned, p)
	return uintptr(unsafe.Pointer(p))
}

func unpin() {
	clear(pinned)
	pinned = pinned[:0]
}

// A string the system allocated, as Go, freeing the original.
func takeString(p uintptr) string {
	if p == 0 {
		return ""
	}
	defer coTaskMemFree.Call(p)
	var units []uint16
	for at := p; ; at += 2 {
		unit := *(*uint16)(unsafe.Pointer(at))
		if unit == 0 {
			break
		}
		units = append(units, unit)
	}
	return syscall.UTF16ToString(units)
}

func newValues() (object, error) { return create(&clsidValues, &iidValues) }

func setString(values object, key *propertyKey, s string) error {
	return check("SetStringValue", values.call(valSetString, ptr(key), ptr(wide(s))))
}

func setGuid(values object, key *propertyKey, g *guid) error {
	return check("SetGuidValue", values.call(valSetGuid, ptr(key), ptr(g)))
}

func getString(values object, key *propertyKey) string {
	var p uintptr
	if failed(values.call(valGetString, ptr(key), ptr(&p))) {
		return ""
	}
	return takeString(p)
}

func getUint64(values object, key *propertyKey) uint64 {
	var n uint64
	if failed(values.call(valGetUint64, ptr(key), ptr(&n))) {
		return 0
	}
	return n
}

func getGuid(values object, key *propertyKey) (guid, bool) {
	var g guid
	return g, !failed(values.call(valGetGuid, ptr(key), ptr(&g)))
}

type session struct {
	device     object
	content    object
	properties object
	resources  object
}

func (s *session) close() {
	s.resources.release()
	s.properties.release()
	s.content.release()
	if s.device != 0 {
		s.device.call(devClose)
		s.device.release()
	}
	*s = session{}
}

type deviceEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func listDevices() ([]deviceEntry, error) {
	manager, err := create(&clsidManager, &iidManager)
	if err != nil {
		return nil, err
	}
	defer manager.release()
	// So one just plugged in is seen by a helper that's been running.
	manager.call(mgrRefresh)
	var count uint32
	if err := check("GetDevices", manager.call(mgrGetDevices, 0, ptr(&count))); err != nil {
		return nil, err
	}
	out := []deviceEntry{}
	if count == 0 {
		return out, nil
	}
	ids := make([]uintptr, count)
	if err := check("GetDevices", manager.call(mgrGetDevices, ptr(&ids[0]), ptr(&count))); err != nil {
		return nil, err
	}
	for _, p := range ids[:count] {
		id := takeString(p)
		name := make([]uint16, 256)
		length := uint32(len(name))
		entry := deviceEntry{ID: id}
		if !failed(manager.call(mgrFriendlyName, ptr(wide(id)), ptr(&name[0]), ptr(&length))) {
			entry.Name = syscall.UTF16ToString(name)
		}
		out = append(out, entry)
	}
	return out, nil
}

func (s *session) open(id string) error {
	s.close()
	info, err := newValues()
	if err != nil {
		return err
	}
	defer info.release()
	if err := setString(info, &keyClientName, "Shelfed"); err != nil {
		return err
	}
	info.call(valSetUint, ptr(&keyClientMajor), 1)
	info.call(valSetUint, ptr(&keyClientMinor), 0)
	info.call(valSetUint, ptr(&keyClientRevision), 0)
	info.call(valSetUint, ptr(&keyClientSecurity), securityImperson)
	device, err := create(&clsidDeviceFTM, &iidDevice)
	if err != nil {
		return err
	}
	if err := check("Open", device.call(devOpen, ptr(wide(id)), uintptr(info))); err != nil {
		device.release()
		return err
	}
	s.device = device
	if err := check("Content", device.call(devContent, ptr(&s.content))); err != nil {
		s.close()
		return err
	}
	if err := check("Properties", s.content.call(contProperties, ptr(&s.properties))); err != nil {
		s.close()
		return err
	}
	if err := check("Transfer", s.content.call(contTransfer, ptr(&s.resources))); err != nil {
		s.close()
		return err
	}
	return nil
}

func (s *session) needOpen() error {
	if s.device == 0 {
		return errors.New("no device is open")
	}
	return nil
}

// The ids of what's directly inside an object.
func (s *session) objectIDs(parent string) ([]string, error) {
	var enum object
	if err := check("EnumObjects", s.content.call(contEnum, 0, ptr(wide(parent)), 0, ptr(&enum))); err != nil {
		return nil, err
	}
	defer enum.release()
	var out []string
	for {
		batch := make([]uintptr, 64)
		var fetched uint32
		hr := enum.call(enumNext, uintptr(len(batch)), ptr(&batch[0]), ptr(&fetched))
		if failed(hr) {
			return out, check("Next", hr)
		}
		for _, p := range batch[:fetched] {
			out = append(out, takeString(p))
		}
		// Anything short of a full batch, S_FALSE included, is the end.
		if fetched == 0 || hr != 0 || len(out) >= mostObjects {
			return out, nil
		}
	}
}

// The values of an object's properties, as a new object to release.
func (s *session) values(id string, keys ...*propertyKey) (object, error) {
	collection, err := create(&clsidKeys, &iidKeys)
	if err != nil {
		return 0, err
	}
	defer collection.release()
	for _, key := range keys {
		collection.call(keysAdd, ptr(key))
	}
	var out object
	// A partial answer still comes with what it has, so only an empty one is a failure.
	hr := s.properties.call(propsGetValues, ptr(wide(id)), uintptr(collection), ptr(&out))
	if out == 0 {
		return 0, check("GetValues", hr)
	}
	return out, nil
}

type storageEntry struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Capacity uint64 `json:"capacity"`
	Free     uint64 `json:"free"`
}

func (s *session) storages() ([]storageEntry, error) {
	ids, err := s.objectIDs("DEVICE")
	if err != nil {
		return nil, err
	}
	out := []storageEntry{}
	for _, id := range ids {
		values, err := s.values(id, &keyCategory, &keyCapacity, &keyFree, &keyDescription, &keyName)
		if err != nil {
			continue
		}
		category, ok := getGuid(values, &keyCategory)
		if ok && category == categoryStorage {
			name := getString(values, &keyDescription)
			if name == "" {
				name = getString(values, &keyName)
			}
			out = append(out, storageEntry{ID: id, Name: name, Capacity: getUint64(values, &keyCapacity), Free: getUint64(values, &keyFree)})
		}
		values.release()
	}
	return out, nil
}

type childEntry struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Size   uint64 `json:"size"`
	Folder bool   `json:"folder"`
}

func (s *session) children(parent string) ([]childEntry, error) {
	ids, err := s.objectIDs(parent)
	if err != nil {
		return nil, err
	}
	out := []childEntry{}
	for _, id := range ids {
		values, err := s.values(id, &keyOriginalName, &keyName, &keySize, &keyContentType)
		if err != nil {
			continue
		}
		name := getString(values, &keyOriginalName)
		if name == "" {
			name = getString(values, &keyName)
		}
		kind, ok := getGuid(values, &keyContentType)
		out = append(out, childEntry{ID: id, Name: name, Size: getUint64(values, &keySize), Folder: ok && (kind == typeFolder || kind == typeFunctional)})
		values.release()
	}
	return out, nil
}

func (s *session) mkdir(parent, name string) (string, error) {
	values, err := newValues()
	if err != nil {
		return "", err
	}
	defer values.release()
	for _, set := range []error{
		setString(values, &keyParent, parent),
		setString(values, &keyName, name),
		setString(values, &keyOriginalName, name),
		setGuid(values, &keyContentType, &typeFolder),
		setGuid(values, &keyFormat, &formatPropsOnly),
	} {
		if set != nil {
			return "", set
		}
	}
	var id uintptr
	if err := check("CreateObjectWithPropertiesOnly", s.content.call(contCreateProps, uintptr(values), ptr(&id))); err != nil {
		return "", err
	}
	return takeString(id), nil
}

func (s *session) send(parent, name, path string, report func(uint64)) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return "", err
	}
	values, err := newValues()
	if err != nil {
		return "", err
	}
	defer values.release()
	for _, set := range []error{
		setString(values, &keyParent, parent),
		setString(values, &keyName, name),
		setString(values, &keyOriginalName, name),
		setGuid(values, &keyContentType, &typeGenericFile),
		setGuid(values, &keyFormat, &formatUnspecified),
		check("SetSize", values.call(valSetUint64, ptr(&keySize), uintptr(stat.Size()))),
	} {
		if set != nil {
			return "", set
		}
	}
	var stream object
	optimal := uint32(0)
	if err := check("CreateObjectWithPropertiesAndData", s.content.call(contCreateData, uintptr(values), ptr(&stream), ptr(&optimal), 0)); err != nil {
		return "", err
	}
	defer stream.release()
	size := int(optimal)
	if size <= 0 {
		size = readChunk
	}
	buffer := make([]byte, size)
	var done, told uint64
	for {
		n, readErr := file.Read(buffer)
		for at := 0; at < n; {
			var written uint32
			if err := check("Write", stream.call(streamWrite, ptr(&buffer[at]), uintptr(n-at), ptr(&written))); err != nil {
				stream.call(streamRevert)
				return "", err
			}
			if written == 0 {
				stream.call(streamRevert)
				return "", errors.New("the device took no more of the file")
			}
			at += int(written)
			done += uint64(written)
		}
		if done-told >= progressEveryByte {
			told = done
			report(done)
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			stream.call(streamRevert)
			return "", readErr
		}
	}
	// The object only exists on the device once this has come back.
	if err := check("Commit", stream.call(streamCommit, 0)); err != nil {
		return "", err
	}
	report(done)
	var data object
	if failed(stream.call(mQI, ptr(&iidDataStream), ptr(&data))) {
		return "", nil
	}
	defer data.release()
	var id uintptr
	if failed(data.call(dataGetObjectID, ptr(&id))) {
		return "", nil
	}
	return takeString(id), nil
}

func (s *session) openStream(id string) (object, int, error) {
	var stream object
	optimal := uint32(0)
	if err := check("GetStream", s.resources.call(resGetStream, ptr(wide(id)), ptr(&keyResourceDefault), 0, ptr(&optimal), ptr(&stream))); err != nil {
		return 0, 0, err
	}
	size := int(optimal)
	if size <= 0 {
		size = readChunk
	}
	return stream, size, nil
}

// Copies a file off the device, no more of it than limit bytes. On any failure
// no part of it stays behind.
func (s *session) fetch(id, path string, limit uint64, report func(uint64)) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	err = s.copyOut(id, file, limit, report)
	file.Close()
	if err != nil {
		os.Remove(path)
	}
	return err
}

func (s *session) copyOut(id string, file *os.File, limit uint64, report func(uint64)) error {
	stream, size, err := s.openStream(id)
	if err != nil {
		return err
	}
	defer stream.release()
	buffer := make([]byte, size)
	var done, told uint64
	for {
		var got uint32
		hr := stream.call(streamRead, ptr(&buffer[0]), uintptr(len(buffer)), ptr(&got))
		if failed(hr) {
			return check("Read", hr)
		}
		if got == 0 {
			break
		}
		if done+uint64(got) > limit {
			return errors.New("the device sent more of a file than it said there was")
		}
		if _, err := file.Write(buffer[:got]); err != nil {
			return err
		}
		done += uint64(got)
		if done-told >= progressEveryByte {
			told = done
			report(done)
		}
	}
	report(done)
	return nil
}

// Part of a file, or nil when it's too far in to be worth it. These streams
// only reliably go forward, so what's before the part gets read and dropped.
func (s *session) read(id string, offset, length int) (*string, error) {
	if offset < 0 || length < 0 || offset > longestSkip || length > longestSkip {
		return nil, nil
	}
	stream, size, err := s.openStream(id)
	if err != nil {
		return nil, err
	}
	defer stream.release()
	buffer := make([]byte, size)
	var kept []byte
	at := 0
	for at < offset+length {
		var got uint32
		hr := stream.call(streamRead, ptr(&buffer[0]), uintptr(len(buffer)), ptr(&got))
		if failed(hr) {
			return nil, check("Read", hr)
		}
		if got == 0 {
			break
		}
		from := max(offset-at, 0)
		to := min(offset+length-at, int(got))
		if from < to {
			kept = append(kept, buffer[from:to]...)
		}
		at += int(got)
	}
	out := base64.StdEncoding.EncodeToString(kept)
	return &out, nil
}

func (s *session) remove(id string) error {
	ids, err := create(&clsidVariants, &iidVariants)
	if err != nil {
		return err
	}
	defer ids.release()
	// A PROPVARIANT holding a wide string: the type, then the pointer eight bytes in.
	var variant [3]uintptr
	*(*uint16)(unsafe.Pointer(&variant[0])) = vtLPWSTR
	text := wide(id)
	variant[1] = ptr(text)
	if err := check("Add", ids.call(variantsAdd, ptr(&variant))); err != nil {
		return err
	}
	return check("Delete", s.content.call(contDelete, deleteRecursive, uintptr(ids), 0))
}

// Makes every kind of object the helper can make without a device, so a build
// can be checked on a computer with nothing plugged in.
func selfCheck() error {
	for _, pair := range [][2]*guid{{&clsidManager, &iidManager}, {&clsidDeviceFTM, &iidDevice}, {&clsidValues, &iidValues}, {&clsidKeys, &iidKeys}, {&clsidVariants, &iidVariants}} {
		made, err := create(pair[0], pair[1])
		if err != nil {
			return err
		}
		made.release()
	}
	return nil
}

type request struct {
	ID   int             `json:"id"`
	Cmd  string          `json:"cmd"`
	Args json.RawMessage `json:"args"`
}

type arguments struct {
	ID     string `json:"id"`
	Parent string `json:"parent"`
	Name   string `json:"name"`
	Path   string `json:"path"`
	Offset int    `json:"offset"`
	Length int    `json:"length"`
	Size   uint64 `json:"size"`
}

func (s *session) handle(cmd string, a arguments, report func(uint64)) (any, error) {
	switch cmd {
	case "check":
		return true, selfCheck()
	case "devices":
		return listDevices()
	case "open":
		return true, s.open(a.ID)
	case "close":
		s.close()
		return true, nil
	}
	if err := s.needOpen(); err != nil {
		return nil, err
	}
	switch cmd {
	case "storages":
		return s.storages()
	case "children":
		return s.children(a.Parent)
	case "mkdir":
		return s.mkdir(a.Parent, a.Name)
	case "send":
		return s.send(a.Parent, a.Name, a.Path, report)
	case "fetch":
		return true, s.fetch(a.ID, a.Path, a.Size, report)
	case "read":
		return s.read(a.ID, a.Offset, a.Length)
	case "delete":
		return true, s.remove(a.ID)
	}
	return nil, fmt.Errorf("no such command: %s", cmd)
}

func main() {
	// COM belongs to the thread that started it, so all of it stays on this one.
	runtime.LockOSThread()
	if hr, _, _ := coInitialize.Call(0, coinitMTA); failed(hr) {
		fmt.Fprintf(os.Stderr, "CoInitializeEx failed: 0x%08x\n", uint32(hr))
		os.Exit(1)
	}
	out := json.NewEncoder(os.Stdout)
	input := bufio.NewScanner(os.Stdin)
	input.Buffer(make([]byte, 64*1024), 16*1024*1024)
	var s session
	defer s.close()
	for input.Scan() {
		var req request
		if err := json.Unmarshal(input.Bytes(), &req); err != nil {
			continue
		}
		var a arguments
		if len(req.Args) > 0 {
			_ = json.Unmarshal(req.Args, &a)
		}
		report := func(done uint64) { _ = out.Encode(map[string]any{"id": req.ID, "done": done}) }
		result, err := s.handle(req.Cmd, a, report)
		if err != nil {
			_ = out.Encode(map[string]any{"id": req.ID, "ok": false, "error": err.Error()})
			continue
		}
		_ = out.Encode(map[string]any{"id": req.ID, "ok": true, "result": result})
	}
}
