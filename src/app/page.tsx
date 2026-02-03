import { redirect } from "next/navigation";

export default function Home() {
  // Redirect immediately to the main chat interface
  // This happens on the server, so it's instant for the user.
  redirect("/chat");
}
