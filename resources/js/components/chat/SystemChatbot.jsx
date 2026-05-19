import { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, Send, X } from "lucide-react";

const starterMessages = [
  "Where is control number 0518001?",
  "What is the normal approval flow?",
  "How do I use OCR extraction?",
];

export default function SystemChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello. I can help with DocuTracker status lookup, workflow guidance, OCR extraction, forwarding, approval, and releasing questions.",
      provider: "system",
    },
  ]);
  const endRef = useRef(null);

  const visibleHistory = useMemo(
    () => messages.filter((message) => message.role === "user" || message.role === "assistant").slice(-8),
    [messages]
  );

  const sendMessage = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || isSending) return;

    const userMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const result = await base44.assistant.chat({
        message: text,
        history: visibleHistory,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result?.reply || "No response was returned.",
          provider: result?.provider || "assistant",
        },
      ]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error.message || "Assistant failed to respond.",
          provider: "error",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-5 z-50">
      {isOpen && (
        <div className="mb-3 w-[calc(100vw-2rem)] max-w-md rounded-2xl border bg-background shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/40">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold leading-tight">DocuTracker Assistant</p>
                <p className="text-xs text-muted-foreground">System-limited Gemini chat</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="h-80 overflow-y-auto p-4 space-y-3">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={
                    message.role === "user"
                      ? "inline-block max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground text-left"
                      : "inline-block max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-left"
                  }
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === "assistant" && message.provider && message.provider !== "system" && (
                    <Badge variant="outline" className="mt-2 text-[10px]">
                      {message.provider}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {starterMessages.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => sendMessage(starter)}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                >
                  {starter}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask about a document, control number, OCR, or workflow..."
                className="min-h-11 max-h-28 text-sm"
              />
              <Button type="button" size="icon" onClick={() => sendMessage()} disabled={!input.trim() || isSending}>
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        aria-label="Open DocuTracker Assistant"
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-14 rounded-full shadow-xl px-5 gap-2"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        <span className="hidden sm:inline">{isOpen ? "Close AI Chat" : "AI Assistant"}</span>
      </Button>
    </div>
  );
}
