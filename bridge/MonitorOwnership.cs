internal static class MonitorOwnership
{
    internal static FileStream Acquire(string home) => new(
        Path.Combine(home,"account-monitor-owner.lock"),FileMode.OpenOrCreate,
        FileAccess.ReadWrite,FileShare.None);
}
