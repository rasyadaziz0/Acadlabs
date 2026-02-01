"use client";

import { useParams } from "next/navigation";
import ChatInterface from "@/components/chat/ChatInterface";

export default function ChatIdPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatInterface initialChatId={id} />;
}