"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Plus, MoreVertical, Pencil, Trash2, Code, Calculator, Heart } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { motion } from "framer-motion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type Chat = {
  id: string;
  message: string | null;
  title: string | null;
  created_at: string;
  user_id: string;
  role: string;
};

type ChatAction = {
  type: "rename" | "delete";
  chatId: string;
};

type SidebarProps = {
  variant?: "page" | "panel"; // page: desktop left column; panel: content for mobile sheet
};

export default function Sidebar({ variant = "page" }: SidebarProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [newChatName, setNewChatName] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchChats = async () => {
      setIsLoading(true);

      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setIsLoading(false);
        return;
      }

      // Fetch only chats belonging to the current user
      const { data: chatsData, error } = await supabase
        .from("chats")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (!error && chatsData) {
        setChats(chatsData);
      } else if (error) {
        console.error("Error fetching chats:", error);
      }
      setIsLoading(false);
    };

    fetchChats();
  }, [supabase]);

  const createNewChat = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data: newChat, error } = await supabase
      .from("chats")
      .insert({
        user_id: userData.user.id,
        message: "",
        role: "user", // required by schema
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating chat:", error);
      return;
    }

    if (newChat) {
      setChats([newChat, ...chats]);
      router.push(`/chat/${newChat.id}`);
    }
  };

  const handleChatAction = (action: ChatAction) => {
    if (action.type === "rename") {
      const chat = chats.find(c => c.id === action.chatId);
      if (chat) {
        setSelectedChat(chat);
        setNewChatName(chat.title || "");
        setIsRenaming(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } else if (action.type === "delete") {
      deleteChat(action.chatId);
    }
  };

  const renameChat = async () => {
    if (!selectedChat || !newChatName.trim()) return;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error } = await supabase
      .from("chats")
      .update({ title: newChatName })
      .eq("id", selectedChat.id)
      .eq("user_id", userData.user.id);

    if (error) {
      console.error("Error renaming chat:", error);
      return;
    }

    // Update local state
    setChats(chats.map(chat =>
      chat.id === selectedChat.id ? { ...chat, title: newChatName } : chat
    ));

    setIsRenaming(false);
    setSelectedChat(null);
    setNewChatName("");
  };

  const deleteChat = async (chatId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId)
      .eq("user_id", userData.user.id);

    if (error) {
      console.error("Error deleting chat:", error);
      return;
    }

    // Update local state
    setChats(chats.filter(chat => chat.id !== chatId));

    // If the deleted chat is the current one, redirect to /chat
    if (pathname === `/chat/${chatId}`) {
      router.push("/chat");
    }
  };

  const ChatList = () => (
    <div className="space-y-1">
      {isLoading ? (
        <div className="flex justify-center p-4">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      ) : chats.length > 0 ? (
        chats.map((chat) => (
          <motion.div
            key={chat.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="group relative"
          >
            <Button
              variant={pathname === `/chat/${chat.id}` ? "secondary" : "ghost"}
              className="w-full justify-start truncate text-left rounded-lg py-2 pr-8 text-sm"
              onClick={() => router.push(`/chat/${chat.id}`)}
            >
              {chat.title && chat.title.trim().length > 0 ? chat.title : "Untitled Chat"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleChatAction({ type: "rename", chatId: chat.id })}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleChatAction({ type: "delete", chatId: chat.id })}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        ))
      ) : (
        <div className="px-4 text-center text-sm text-muted-foreground">
          No chats yet
        </div>
      )}
    </div>
  );

  const navigateToCodeRunner = () => {
    router.push("/code-runner");
  };

  const navigateToMath = () => {
    router.push("/math");
  };

  const Panel = () => (
    <div className="flex h-full flex-col">
      <div className="flex flex-col space-y-4 p-4 pt-10">
        <Button
          variant="outline"
          className="flex justify-start gap-2 h-9 w-full border border-muted-foreground/20 text-sm"
          onClick={createNewChat}
        >
          <Plus className="h-4 w-4" />
          <span>New chat</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <div className="mb-1 text-xs font-medium text-muted-foreground ml-3 mt-3">Menu</div>
        <div className="space-y-1 mb-4">
          <Button
            variant={pathname === "/math" ? "secondary" : "ghost"}
            className="w-full justify-start gap-2 text-left rounded-lg py-2 text-sm"
            onClick={() => router.push("/math")}
          >
            <Calculator className="h-4 w-4" />
            Math Solver
          </Button>
          <Button
            variant={pathname === "/editor" ? "secondary" : "ghost"}
            className="w-full justify-start gap-2 text-left rounded-lg py-2 text-sm"
            onClick={() => router.push("/editor")}
          >
            <Code className="h-4 w-4" />
            Reason Code
          </Button>
        </div>

        <div className="mb-1 text-xs font-medium text-muted-foreground ml-3 mt-3">Chats</div>
        <ChatList />
      </div>
      <div className="p-3 border-t">
        <Button asChild variant="ghost" className="w-full justify-start h-auto px-2 py-2 rounded-lg">
          <a href="https://tako.id/Acadlabs" target="_blank" rel="noopener noreferrer" className="flex w-full items-center">
            <span className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-pink-600/10 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
              <Heart className="h-4 w-4" />
            </span>
            <span className="flex flex-col items-start">
              <span className="text-sm font-medium leading-5">Donasi maintenance</span>
              <span className="text-xs text-muted-foreground">tako.id/Acadlabs</span>
            </span>
          </a>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Rename Dialog */}
      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="chatName">Chat Name</Label>
            <Input
              id="chatName"
              ref={inputRef}
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              placeholder="Enter chat name"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  renameChat();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenaming(false)}>Cancel</Button>
            <Button onClick={renameChat}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {variant === "panel" ? (
        <Panel />
      ) : (
        <div className="hidden w-64 border-r bg-gray-50 dark:bg-card md:block p-2">
          <div className="flex h-full flex-col">
            <div className="flex flex-col space-y-4 p-2">
              <Button
                variant="outline"
                className="flex justify-start gap-2 h-9 w-full border border-muted-foreground/20 text-sm"
                onClick={createNewChat}
              >
                <Plus className="h-4 w-4" />
                <span>New chat</span>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-1">
              <div className="mb-1 text-xs font-medium text-muted-foreground ml-3 mt-3">Menu</div>
              <div className="space-y-1 mb-4">
                <Button
                  variant={pathname === "/math" ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2 text-left rounded-lg py-2 text-sm"
                  onClick={() => router.push("/math")}
                >
                  <Calculator className="h-4 w-4" />
                  Math Solver
                </Button>
                <Button
                  variant={pathname === "/editor" ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2 text-left rounded-lg py-2 text-sm"
                  onClick={() => router.push("/editor")}
                >
                  <Code className="h-4 w-4" />
                  Reason Code
                </Button>
              </div>

              <div className="mb-1 text-xs font-medium text-muted-foreground ml-3 mt-3">Chats</div>
              <ChatList />
            </div>
          </div>
        </div>
      )}
    </>
  );
}