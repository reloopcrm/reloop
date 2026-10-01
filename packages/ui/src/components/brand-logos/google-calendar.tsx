import type * as React from "react";

const GoogleCalendarLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		{...props}
	>
		<rect x="5" y="5" width="14" height="14" fill="#fff" />
		<rect x="5" y="2" width="14" height="3" fill="#4285F4" />
		<rect x="2" y="5" width="3" height="14" fill="#4285F4" />
		<rect x="19" y="5" width="3" height="14" fill="#FBBC04" />
		<rect x="5" y="19" width="14" height="3" fill="#34A853" />
		<path fill="#EA4335" d="M19 19h3l-3 3z" />
		<path fill="#1967D2" d="M19 2h.8A2.2 2.2 0 0 1 22 4.2V5h-3z" />
		<path fill="#188038" d="M2 19h3v3h-.8A2.2 2.2 0 0 1 2 19.8z" />
		<path fill="#1967D2" d="M5 2h-.8A2.2 2.2 0 0 0 2 4.2V5h3z" />
		<text
			x="12"
			y="15.6"
			textAnchor="middle"
			fontFamily="Arial, Helvetica, sans-serif"
			fontSize="8.5"
			fontWeight="700"
			fill="#4285F4"
		>
			31
		</text>
	</svg>
);

export default GoogleCalendarLogo;
