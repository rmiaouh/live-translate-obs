// Process-loopback capture helper for Live Translate for OBS.
// The activation flow follows Microsoft's ApplicationLoopback sample:
// https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/ApplicationLoopback

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <fcntl.h>
#include <io.h>
#include <mmdeviceapi.h>
#include <wrl.h>

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cwctype>
#include <iostream>
#include <map>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;

namespace {

constexpr UINT32 kSampleRate = 48'000;
constexpr WORD kChannels = 1;
constexpr WORD kBitsPerSample = 32;
std::atomic_bool g_running{true};

struct Application {
  std::wstring id;
  std::wstring name;
  DWORD pid = 0;
  bool packaged = false;
};

std::wstring ToLower(std::wstring value) {
  std::transform(value.begin(), value.end(), value.begin(), [](wchar_t character) {
    return static_cast<wchar_t>(std::towlower(character));
  });
  return value;
}

std::wstring ExecutablePath(DWORD pid) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return {};
  std::vector<wchar_t> buffer(32'768);
  DWORD size = static_cast<DWORD>(buffer.size());
  const BOOL ok = QueryFullProcessImageNameW(process, 0, buffer.data(), &size);
  CloseHandle(process);
  return ok ? std::wstring(buffer.data(), size) : std::wstring();
}

std::wstring BaseName(const std::wstring& path) {
  const size_t separator = path.find_last_of(L"\\/");
  return separator == std::wstring::npos ? path : path.substr(separator + 1);
}

std::wstring DisplayName(const std::wstring& executable) {
  std::wstring name = executable;
  if (name.size() > 4 && ToLower(name.substr(name.size() - 4)) == L".exe") name.resize(name.size() - 4);
  if (!name.empty()) name[0] = static_cast<wchar_t>(std::towupper(name[0]));
  return name;
}

BOOL CALLBACK CollectWindow(HWND window, LPARAM parameter) {
  if (!IsWindowVisible(window) || GetWindow(window, GW_OWNER) != nullptr) return TRUE;
  const int titleLength = GetWindowTextLengthW(window);
  if (titleLength <= 0) return TRUE;

  DWORD pid = 0;
  GetWindowThreadProcessId(window, &pid);
  if (!pid || pid == GetCurrentProcessId()) return TRUE;
  std::wstring executable = BaseName(ExecutablePath(pid));
  if (executable.empty()) return TRUE;

  std::wstring id = ToLower(executable);
  bool packaged = false;
  if (id == L"applicationframehost.exe") {
    struct ChildProcess { DWORD framePid; DWORD appPid; } child{pid, 0};
    EnumChildWindows(window, [](HWND childWindow, LPARAM childParameter) -> BOOL {
      auto* state = reinterpret_cast<ChildProcess*>(childParameter);
      DWORD childPid = 0;
      GetWindowThreadProcessId(childWindow, &childPid);
      if (childPid && childPid != state->framePid && !ExecutablePath(childPid).empty()) {
        state->appPid = childPid;
        return FALSE;
      }
      return TRUE;
    }, reinterpret_cast<LPARAM>(&child));
    if (!child.appPid) return TRUE;
    pid = child.appPid;
    executable = BaseName(ExecutablePath(pid));
    id = ToLower(executable);
    packaged = true;
  }
  static const std::vector<std::wstring> ignored = {
      L"explorer.exe", L"shellexperiencehost.exe",
      L"searchhost.exe", L"startmenuexperiencehost.exe", L"textinputhost.exe",
  };
  if (std::find(ignored.begin(), ignored.end(), id) != ignored.end()) return TRUE;

  auto* applications = reinterpret_cast<std::map<std::wstring, Application>*>(parameter);
  applications->try_emplace(id, Application{id, DisplayName(executable), pid, packaged});
  return TRUE;
}

std::string Utf8(const std::wstring& value) {
  if (value.empty()) return {};
  const int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
  return result;
}

std::string JsonEscape(const std::wstring& value) {
  const std::string utf8 = Utf8(value);
  std::string escaped;
  escaped.reserve(utf8.size());
  for (const unsigned char character : utf8) {
    switch (character) {
      case '"': escaped += "\\\""; break;
      case '\\': escaped += "\\\\"; break;
      case '\b': escaped += "\\b"; break;
      case '\f': escaped += "\\f"; break;
      case '\n': escaped += "\\n"; break;
      case '\r': escaped += "\\r"; break;
      case '\t': escaped += "\\t"; break;
      default:
        if (character < 0x20) {
          char encoded[7]{};
          sprintf_s(encoded, "\\u%04x", character);
          escaped += encoded;
        } else {
          escaped.push_back(static_cast<char>(character));
        }
    }
  }
  return escaped;
}

int ListApplications() {
  std::map<std::wstring, Application> applications;
  EnumWindows(CollectWindow, reinterpret_cast<LPARAM>(&applications));
  std::cout << '[';
  bool first = true;
  for (const auto& [_, application] : applications) {
    if (!first) std::cout << ',';
    first = false;
    std::cout << "{\"id\":\"" << JsonEscape(application.id)
              << "\",\"name\":\"" << JsonEscape(application.name)
              << "\",\"type\":\"" << (application.packaged ? "package" : "win32")
              << "\",\"available\":true,\"pid\":" << application.pid << '}';
  }
  std::cout << ']';
  return std::cout.good() ? 0 : 2;
}

class ActivationHandler final : public RuntimeClass<
    RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
 public:
  ActivationHandler() : completed_(CreateEventW(nullptr, FALSE, FALSE, nullptr)) {}
  ~ActivationHandler() override { if (completed_) CloseHandle(completed_); }

  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    ComPtr<IUnknown> activated;
    HRESULT activationResult = E_FAIL;
    HRESULT result = operation->GetActivateResult(&activationResult, &activated);
    if (SUCCEEDED(result)) result = activationResult;
    if (SUCCEEDED(result)) result = activated.As(&audioClient_);
    result_ = result;
    SetEvent(completed_);
    return S_OK;
  }

  HRESULT Wait(ComPtr<IAudioClient>* output) {
    if (!completed_) return HRESULT_FROM_WIN32(GetLastError());
    const DWORD wait = WaitForSingleObject(completed_, 15'000);
    if (wait != WAIT_OBJECT_0) return wait == WAIT_TIMEOUT ? HRESULT_FROM_WIN32(ERROR_TIMEOUT) : HRESULT_FROM_WIN32(GetLastError());
    if (FAILED(result_)) return result_;
    *output = audioClient_;
    return S_OK;
  }

 private:
  HANDLE completed_ = nullptr;
  HRESULT result_ = E_PENDING;
  ComPtr<IAudioClient> audioClient_;
};

BOOL WINAPI ConsoleHandler(DWORD signal) {
  if (signal == CTRL_C_EVENT || signal == CTRL_BREAK_EVENT || signal == CTRL_CLOSE_EVENT) {
    g_running = false;
    return TRUE;
  }
  return FALSE;
}

void PrintError(const char* code, HRESULT result) {
  std::cerr << code << ":0x" << std::hex << static_cast<unsigned long>(result) << std::dec << '\n';
}

int CaptureProcess(DWORD pid) {
  const HRESULT initialize = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(initialize)) {
    PrintError("com_initialize_failed", initialize);
    return 3;
  }

  auto handler = Microsoft::WRL::Make<ActivationHandler>();
  if (!handler) {
    CoUninitialize();
    return 3;
  }

  AUDIOCLIENT_ACTIVATION_PARAMS activation{};
  activation.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  activation.ProcessLoopbackParams.TargetProcessId = pid;
  activation.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  PROPVARIANT parameters{};
  parameters.vt = VT_BLOB;
  parameters.blob.cbSize = sizeof(activation);
  parameters.blob.pBlobData = reinterpret_cast<BYTE*>(&activation);

  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  HRESULT result = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
      __uuidof(IAudioClient),
      &parameters,
      handler.Get(),
      &operation);
  if (FAILED(result)) {
    PrintError("activation_start_failed", result);
    CoUninitialize();
    return 4;
  }

  ComPtr<IAudioClient> audioClient;
  result = handler->Wait(&audioClient);
  if (FAILED(result)) {
    PrintError("activation_failed", result);
    CoUninitialize();
    return 4;
  }

  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = kBitsPerSample;
  format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

  result = audioClient->Initialize(
      AUDCLNT_SHAREMODE_SHARED,
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
          AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
      0,
      0,
      &format,
      nullptr);
  if (FAILED(result)) {
    PrintError("audio_initialize_failed", result);
    CoUninitialize();
    return 5;
  }

  ComPtr<IAudioCaptureClient> captureClient;
  result = audioClient->GetService(IID_PPV_ARGS(&captureClient));
  if (FAILED(result)) {
    PrintError("capture_service_failed", result);
    CoUninitialize();
    return 5;
  }

  HANDLE sampleReady = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!sampleReady) {
    CoUninitialize();
    return 5;
  }
  result = audioClient->SetEventHandle(sampleReady);
  if (SUCCEEDED(result)) result = audioClient->Start();
  if (FAILED(result)) {
    CloseHandle(sampleReady);
    PrintError("capture_start_failed", result);
    CoUninitialize();
    return 5;
  }

  _setmode(_fileno(stdout), _O_BINARY);
  SetConsoleCtrlHandler(ConsoleHandler, TRUE);
  std::cerr << "ready\n";
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  HANDLE targetProcess = OpenProcess(SYNCHRONIZE, FALSE, pid);
  std::vector<float> silence;

  while (g_running) {
    HANDLE waits[] = {sampleReady, targetProcess};
    const DWORD wait = targetProcess
        ? WaitForMultipleObjects(2, waits, FALSE, 1'000)
        : WaitForSingleObject(sampleReady, 1'000);
    if (targetProcess && wait == WAIT_OBJECT_0 + 1) {
      std::cerr << "target_process_exited\n";
      break;
    }
    if (wait != WAIT_OBJECT_0 && wait != WAIT_TIMEOUT) break;

    UINT32 frames = 0;
    while (SUCCEEDED(captureClient->GetNextPacketSize(&frames)) && frames > 0) {
      BYTE* data = nullptr;
      DWORD flags = 0;
      UINT64 devicePosition = 0;
      UINT64 performancePosition = 0;
      result = captureClient->GetBuffer(&data, &frames, &flags, &devicePosition, &performancePosition);
      if (FAILED(result)) break;

      const DWORD bytes = frames * format.nBlockAlign;
      const void* payload = data;
      if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0) {
        silence.assign(frames, 0.0f);
        payload = silence.data();
      }
      DWORD written = 0;
      const BOOL writeOk = WriteFile(output, payload, bytes, &written, nullptr);
      captureClient->ReleaseBuffer(frames);
      if (!writeOk || written != bytes) {
        g_running = false;
        break;
      }
    }
  }

  audioClient->Stop();
  if (targetProcess) CloseHandle(targetProcess);
  CloseHandle(sampleReady);
  CoUninitialize();
  return 0;
}

void Usage() {
  std::cerr << "usage: windows-audio-capture --list | --capture <pid>\n";
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
  if (argc == 2 && wcscmp(argv[1], L"--list") == 0) return ListApplications();
  if (argc == 3 && wcscmp(argv[1], L"--capture") == 0) {
    wchar_t* end = nullptr;
    const unsigned long pid = wcstoul(argv[2], &end, 10);
    if (!pid || !end || *end != L'\0') {
      Usage();
      return 2;
    }
    return CaptureProcess(static_cast<DWORD>(pid));
  }
  Usage();
  return 2;
}
