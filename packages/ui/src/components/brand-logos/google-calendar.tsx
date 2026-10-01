import type * as React from "react";

const GoogleCalendarLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		{...props}
	>
		<path fill="#fff" d="M5 5h14v14H5z" />
		<path fill="#4285F4" d="M5 2h14v3H5zM2 5h3v14H2z" />
		<path fill="#FBBC04" d="M19 5h3v14h-3z" />
		<path fill="#34A853" d="M5 19h14v3H5z" />
		<path fill="#EA4335" d="M19 19h3l-3 3z" />
		<path fill="#1967D2" d="M19 2h.8A2.2 2.2 0 0 1 22 4.2V5h-3zM5 2h-.8A2.2 2.2 0 0 0 2 4.2V5h3z" />
		<path fill="#188038" d="M2 19h3v3h-.8A2.2 2.2 0 0 1 2 19.8z" />
		<path
			fill="none"
			stroke="#4285F4"
			strokeWidth="1.3"
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M8 9.7c.3-.7 1-1.1 1.8-1.1 1 0 1.7.6 1.7 1.4 0 .9-.7 1.4-1.8 1.4 1.2 0 1.9.7 1.9 1.6 0 1-.8 1.7-1.9 1.7-.9 0-1.6-.4-1.9-1.2M13.7 9.7l1.7-1.1v6.3"
		/>
	</svg>
);

export default GoogleCalendarLogo;
