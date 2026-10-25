using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace CodexAccountDesk;
internal static class WindowsProcessImage
{
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern SafeProcessHandle OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool QueryFullProcessImageName(SafeProcessHandle process, uint flags, StringBuilder name, ref int size);
    internal static string? Read(Process process)
    {
        // PROCESS_QUERY_LIMITED_INFORMATION also works for restricted renderer processes.
        // Enumerating MainModule asks for stronger rights and races process teardown.
        using var handle=OpenProcess(0x1000, false, process.Id);
        if(handle.IsInvalid)
        {
            var error=Marshal.GetLastWin32Error();
            if(error==87 || process.HasExited)return null;
            throw new IOException("Nelze ověřit vlastníka běžícího procesu Codexu.",new Win32Exception(error));
        }
        var size=32768; var name=new StringBuilder(size);
        if(QueryFullProcessImageName(handle,0,name,ref size))return name.ToString();
        var code=Marshal.GetLastWin32Error();
        if(process.HasExited)return null;
        throw new IOException("Nelze ověřit cestu běžícího procesu Codexu.",new Win32Exception(code));
    }
}
