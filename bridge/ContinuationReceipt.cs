using System.Text.Json;
using CodexAccountDesk;

// A lost reply is not permission to send another continuation.
internal static class ContinuationReceipt
{
    internal static ChatResumeState? Evidence(SwitchChat chat,DesktopThreadState? thread)
    {
        if(thread==null||thread.Id!=chat.Id||thread.Waiting||
           string.IsNullOrEmpty(chat.ContinueMessageId)||thread.LastMessageId!=chat.ContinueMessageId||
           string.IsNullOrEmpty(thread.LastTurnId)||thread.LastTurnId==chat.OriginalTurnId)return null;
        if(thread.Status=="active"&&thread.LastTurnStatus=="inProgress")return ChatResumeState.Resumed;
        if(thread.Status=="idle"&&thread.LastTurnStatus=="completed")return ChatResumeState.Completed;
        return null;
    }

    internal static async Task<ChatResumeState> ConfirmAsync(SwitchChat chat,
        Func<DesktopThreadState?> read,Func<Task<bool>> targetMatches,
        Func<Task> wait,int samples=10)
    {
        for(var attempt=0;attempt<=samples;attempt++)
        {
            if(!await targetMatches())return ChatResumeState.Unconfirmed;
            if(Evidence(chat,read()) is ChatResumeState evidence)return evidence;
            if(attempt<samples)await wait();
        }
        return ChatResumeState.Unconfirmed;
    }

    internal static async Task<ChatResumeState> SendOnceAsync(SwitchChat chat,
        Func<Task<JsonElement>> send,Func<DesktopThreadState?> read,
        Func<Task<bool>> targetMatches,Func<Task> wait,Action<Exception> diagnostic,
        CancellationToken cancellation=default)
    {
        try
        {
            var response=await send();
            // Transport already unwraps its envelope. Accept the known nested
            // result as well as a direct turn receipt, but require a new ID.
            if(response.TryGetProperty("result",out var nested))response=nested;
            if(response.TryGetProperty("turn",out var turn)&&turn.TryGetProperty("id",out var id)&&
               id.ValueKind==JsonValueKind.String&&!string.IsNullOrWhiteSpace(id.GetString())&&id.GetString()!=chat.OriginalTurnId)
                return await targetMatches()?ChatResumeState.Resumed:ChatResumeState.Unconfirmed;
            throw new InvalidDataException("Continuation receipt is missing.");
        }
        catch(OperationCanceledException) when(cancellation.IsCancellationRequested){throw;}
        catch(Exception error){diagnostic(error);}
        return await ConfirmAsync(chat,read,targetMatches,wait);
    }
}
