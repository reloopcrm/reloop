const SECOND_MS = 1_000;
const KB = 1_024;

export const WEBSITE = {
	timeoutMs: 15 * SECOND_MS,
	modelTimeoutMs: 60 * SECOND_MS,
	htmlMaxChars: 400 * KB,
	textMaxChars: 6_000,
	jsonAttempts: 2,
	userAgent: "Mozilla/5.0 (compatible; CRM brand reader)",

	industry: {
		question: "industry",
		threshold: 0.5,
		noMatch: "Other",
		stateMaxChars: 4_000,
		options: {
			"Logistics and freight":
				"Moves or stores goods for other companies: hauliers, freight forwarders, couriers, shipping lines, ports, warehousing and fulfilment.",
			"Pallets and packaging":
				"Makes, trades, repairs, rents or recycles pallets, crates, boxes, film, strapping or other transport packaging.",
			"Wholesale and trading":
				"Buys goods it does not make and resells them to businesses: importers, exporters, distributors and dealers.",
			Manufacturing:
				"Makes physical goods in its own plant, for anything not covered by a more exact option.",
			"Construction and trades":
				"Builds, installs, fits out or maintains buildings and infrastructure, including civil works and craft trades.",
			"Timber and forestry":
				"Sawmills, timber merchants, joineries, forestry and wood products.",
			"Metals, waste and recycling":
				"Steel and metal works, scrap dealers, waste collection, sorting and recycling.",
			"Food and beverage":
				"Grows, processes, bakes, brews, bottles or distributes food and drink.",
			Agriculture:
				"Farms, growers, livestock, horticulture and agricultural supply.",
			"Chemicals and plastics":
				"Chemicals, paints, adhesives, plastics and rubber processing.",
			"Automotive and vehicles":
				"Vehicle makers, suppliers, dealers, workshops and fleet services.",
			"Machinery and equipment":
				"Industrial machines, tools, handling equipment, their dealers and their service.",
			"Retail and ecommerce":
				"Sells to consumers through shops or an online shop.",
			"Energy and utilities":
				"Power, gas, heat, water, fuel and renewable energy.",
			"IT and software":
				"Software, hosting, IT services, telecommunications and electronics.",
			"Professional services":
				"Consulting, law, accounting, engineering offices, architecture, recruitment and other advisory work.",
			"Marketing and media":
				"Agencies, advertising, publishing, print, film and events.",
			"Finance and insurance":
				"Banks, lenders, leasing, payments, insurers and brokers.",
			"Real estate and property":
				"Developers, landlords, agents and facility management.",
			"Healthcare and pharma":
				"Clinics, practices, care, medical devices and pharmaceuticals.",
			"Education and training":
				"Schools, universities, academies and training providers.",
			"Public sector and nonprofit":
				"Authorities, municipalities, associations, charities and other bodies that do not trade for profit.",
			"Hospitality and tourism":
				"Hotels, restaurants, catering, travel and leisure.",
			Other:
				"The page does not show a business that fits any of the options above, or it does not say what the company does at all.",
		},
	},
} as const;
