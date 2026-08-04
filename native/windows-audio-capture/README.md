# Windows application audio helper

This x64 sidecar lists visible Win32 applications and streams 48 kHz mono
floating-point PCM from one selected process tree to stdout. It uses the
documented `AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK` API available from
Windows build 20348.

The activation and capture flow is adapted from Microsoft's MIT-licensed
[ApplicationLoopback sample](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback).
No source audio is written to disk.
