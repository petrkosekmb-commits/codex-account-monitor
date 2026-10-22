using System.Diagnostics;

internal static class DesktopLaunch
{
    internal static ProcessStartInfo Create(string executable,string? threadId)
    {
        if(!Guid.TryParse(threadId,out _))throw new InvalidDataException("Chybí ověřený chat pro otevření Codexu.");
        if(!File.Exists(executable))throw new FileNotFoundException("Chybí aplikace Codex.");
        var start=new ProcessStartInfo(executable){UseShellExecute=false,WorkingDirectory=Path.GetDirectoryName(executable)!};
        start.ArgumentList.Add("--single-argument");
        start.ArgumentList.Add("codex://threads/"+threadId);
        return start;
    }
}
