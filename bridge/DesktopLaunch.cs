using System.Diagnostics;

internal static class DesktopLaunch
{
    internal static ProcessStartInfo Create(string executable,string? threadId)
    {
        if(!Guid.TryParse(threadId,out _))throw new InvalidDataException("Chybí ověřený chat pro otevření Codexu.");
        if(!File.Exists(executable))throw new FileNotFoundException("Chybí aplikace Codex.");
        var start=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(executable)!};
        var relay=Path.Combine(AppContext.BaseDirectory,"CodexMonitorRelay.exe");
        if(File.Exists(relay)&&File.Exists(Path.Combine(AppContext.BaseDirectory,"CodexMonitorRelay.bootstrap.json")))
            start.Environment["CODEX_CLI_PATH"]=relay;
        start.ArgumentList.Add("--single-argument");
        start.ArgumentList.Add("codex://threads/"+threadId);
        return start;
    }
}
