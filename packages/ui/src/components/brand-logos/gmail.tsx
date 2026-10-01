import type * as React from "react";

const GmailLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 24 18"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		{...props}
	>
		<path fill="#4285F4" d="M1.6 18h3.8V8.6L0 4.5v11.9C0 17.3.7 18 1.6 18z" />
		<path fill="#34A853" d="M18.6 18h3.8c.9 0 1.6-.7 1.6-1.6V4.5l-5.4 4.1z" />
		<path
			fill="#FBBC04"
			d="M18.6 1.6v7l5.4-4.1V2.4c0-2-2.3-3.1-3.9-1.9z"
		/>
		<path fill="#EA4335" d="M5.4 8.6v-7L12 6.6l6.6-5v7L12 13.6z" />
		<path
			fill="#C5221F"
			d="M0 2.4v2.1l5.4 4.1v-7L3.9.5C2.3-.7 0 .4 0 2.4z"
		/>
	</svg>
);

export default GmailLogo;
