using System.Diagnostics;
using System.Runtime.InteropServices;

// Close only the verified desktop window. Restart Manager can include other
// applications in a shutdown; the monitor must stay outside that operation.
internal static class DesktopClose
{
    private const uint QueryEndSession=0x0011,EndSession=0x0016;
    private const uint AbortIfHung=0x0002,Block=0x0001;
    [DllImport("user32.dll",SetLastError=true)]
    private static extern IntPtr SendMessageTimeoutW(IntPtr window,uint message,UIntPtr wParam,IntPtr lParam,uint flags,uint timeout,out UIntPtr result);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
    internal static async Task CloseAsync(string executable,CancellationToken cancellation)
    {
        var matching=new List<Process>();
        try
        {
            foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(executable)))
            {
                try { if(string.Equals(process.MainModule?.FileName,executable,StringComparison.OrdinalIgnoreCase))matching.Add(process);else process.Dispose(); }
                catch(InvalidOperationException){process.Dispose();}
            }
            if(matching.Count==0)return;
            var targets=matching.Select(p=>(Process:p,Window:p.MainWindowHandle)).Where(t=>t.Window!=IntPtr.Zero).ToArray();
            if(targets.Length==0)throw new DesktopCloseException("Codex nemá ověřené hlavní okno. Ukonči jej z nabídky aplikace.");
            await CloseTargetsAsync(targets,cancellation);
            var deadline=DateTimeOffset.UtcNow.AddSeconds(15);
            while(matching.Any(p=>!p.HasExited))
            {
                cancellation.ThrowIfCancellationRequested();
                if(DateTimeOffset.UtcNow>=deadline)throw new TimeoutException("Codex po zavření okna stále běží. Přihlášení nebylo změněno.");
                await Task.Delay(100,cancellation);
            }
        }
        finally {foreach(var process in matching)process.Dispose();}
    }
    internal static async Task CloseTargetsAsync((Process Process,IntPtr Window)[] targets,CancellationToken cancellation)
    {
        foreach(var target in targets)
        {
            cancellation.ThrowIfCancellationRequested();
            GetWindowThreadProcessId(target.Window,out var pid);
            if(pid!=(uint)target.Process.Id||target.Process.HasExited)throw new DesktopCloseException("Okno Codexu změnilo vlastníka; přepnutí bylo zastaveno.");
            var ok=SendMessageTimeoutW(target.Window,QueryEndSession,UIntPtr.Zero,new IntPtr(1),AbortIfHung|Block,5000,out var accepted);
            if(ok==IntPtr.Zero||accepted==UIntPtr.Zero)throw new DesktopCloseException("Codex odmítl ukončení nebo čeká na odpověď. Vyřeš požadavek v jeho okně; účet zůstal zachovaný.");
        }
        foreach(var target in targets)
        {
            cancellation.ThrowIfCancellationRequested();
            GetWindowThreadProcessId(target.Window,out var pid);
            if(pid!=(uint)target.Process.Id)throw new DesktopCloseException("Vlastník okna se změnil.");
            if(SendMessageTimeoutW(target.Window,EndSession,new UIntPtr(1),new IntPtr(1),AbortIfHung|Block,5000,out _)==IntPtr.Zero&&!target.Process.HasExited)
                throw new DesktopCloseException("Codex nepotvrdil ukončení. Přihlášení nebylo změněno.");
        }
        using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(30));
        try{await Task.WhenAll(targets.Select(t=>t.Process.WaitForExitAsync(deadline.Token)));}
        catch(OperationCanceledException) when(!cancellation.IsCancellationRequested){throw new TimeoutException("Codex se včas neukončil. Přihlášení nebylo změněno.");}
    }
}
internal sealed class DesktopCloseException(string message):IOException(message);
