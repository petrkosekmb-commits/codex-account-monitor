using System.Diagnostics;
using System.Runtime.InteropServices;

internal static class DesktopCloseFixture
{
    private delegate IntPtr WindowProc(IntPtr window,uint message,UIntPtr wParam,IntPtr lParam);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct WindowClass
    {public uint Style;public WindowProc Procedure;public int ClassExtra,WindowExtra;public IntPtr Instance,Icon,Cursor,Background;public string? Menu;public string Name;}
    [StructLayout(LayoutKind.Sequential)] private struct Message{public IntPtr Window;public uint Id;public UIntPtr WParam;public IntPtr LParam;public uint Time;public int X,Y;public uint Private;}
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern ushort RegisterClassW(ref WindowClass value);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] private static extern IntPtr CreateWindowExW(uint extra,string className,string title,uint style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr parameter);
    [DllImport("user32.dll")] private static extern int GetMessageW(out Message message,IntPtr window,uint minimum,uint maximum);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref Message message);
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr window,uint message,UIntPtr wParam,IntPtr lParam);
    [DllImport("user32.dll")] private static extern void PostQuitMessage(int exitCode);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    internal static void Run(bool refuse)
    {
        WindowProc handler=(window,message,wParam,lParam)=>{
            if(message==0x0011)return refuse?IntPtr.Zero:new IntPtr(1);
            if(message==0x0016&&wParam!=UIntPtr.Zero){DestroyWindow(window);PostQuitMessage(0);return IntPtr.Zero;}
            return DefWindowProcW(window,message,wParam,lParam);
        };
        var value=new WindowClass{Procedure=handler,Name="AccountMonitorFixture"};
        if(RegisterClassW(ref value)==0)throw new Exception("Fixture class failed");
        var handle=CreateWindowExW(0,value.Name,"Synthetic desktop",0,0,0,1,1,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
        if(handle==IntPtr.Zero)throw new Exception("Fixture window failed");
        Console.WriteLine(handle.ToInt64());Console.Out.Flush();
        while(GetMessageW(out var message,IntPtr.Zero,0,0)>0)DispatchMessageW(ref message);
        GC.KeepAlive(handler);
    }
    internal static async Task VerifyAsync()
    {
        foreach(var refuse in new[]{false,true})
        {
            var start=new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true};
            start.ArgumentList.Add("--desktop-close-fixture");start.ArgumentList.Add(refuse?"refuse":"allow");
            using var child=Process.Start(start)!;
            try
            {
                var handle=new IntPtr(long.Parse((await child.StandardOutput.ReadLineAsync())!));
                using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(15));
                var rejected=false;
                try{await DesktopClose.CloseTargetsAsync(new[]{(child,handle)},timeout.Token);}catch(IOException){rejected=true;}
                if(rejected!=refuse)throw new Exception("Desktop close refusal was not respected");
                if(!refuse&&child.ExitCode!=0)throw new Exception("Desktop fixture failed to close");
                if(refuse&&child.HasExited)throw new Exception("Refused desktop was terminated");
                Console.WriteLine("PASS targeted desktop close "+(refuse?"preserves refusing application":"closes only its window and leaves test host alive"));
            }
            finally{if(!child.HasExited){child.Kill();await child.WaitForExitAsync();}}
        }
    }
}