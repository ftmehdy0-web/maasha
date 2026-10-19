import type { Metadata } from "next";
import ClientEditor from "@/components/editor/ClientEditor";

export const metadata: Metadata = {
  title: "Maasha — editor",
};

export default function EditorPage() {
  return <ClientEditor />;
}
