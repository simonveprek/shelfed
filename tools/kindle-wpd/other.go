//go:build !windows

package main

// The helper only means anything on Windows. This keeps the folder buildable
// and testable from anywhere.
func main() {}
