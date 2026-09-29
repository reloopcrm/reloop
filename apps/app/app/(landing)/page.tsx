import { redirect } from "next/navigation";
import { PROXY } from "@/lib/proxy-config";

export default function Home() {
	redirect(PROXY.path.signIn);
}
