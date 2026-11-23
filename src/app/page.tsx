import { redirect } from "next/navigation";

// Private beta: everything starts at /connect.
export default function Home() {
  redirect("/connect");
}
