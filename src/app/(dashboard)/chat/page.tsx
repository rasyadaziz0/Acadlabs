"use client";

import ChatInterface from "@/components/chat/ChatInterface";

export default function ChatPage() {
  return (
    <div className="h-full overflow-hidden">
      <ChatInterface initialChatId={undefined} key="new-chat" />
    </div>
  );
}
