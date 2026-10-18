import { redirect } from "next/navigation";

export default async function TypesafeConnectionPage({
	params,
}: PageProps<"/[slug]/settings/connections/typesafe">) {
	const { slug } = await params;
	redirect(`/${slug}/settings/ai`);
}
