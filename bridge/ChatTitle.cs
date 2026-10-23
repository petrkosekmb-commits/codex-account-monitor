internal static class ChatTitle
{
    public static string Resolve(string? storedName,string? capturedTitle)
    {
        if(!string.IsNullOrWhiteSpace(storedName))return storedName;
        if(!string.IsNullOrWhiteSpace(capturedTitle))return capturedTitle;
        throw new InvalidDataException("Chybí ověřený název chatu.");
    }
}
