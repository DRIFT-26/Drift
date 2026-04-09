import { redirect } from "next/navigation";
import LandingAuthNav from "@/app/_components/LandingAuthNav";

export default function Home() {
  redirect("/app/alerts");
}