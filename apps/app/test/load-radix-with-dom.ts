import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
await Promise.all([
	import("@crm/ui/components/dialog"),
	import("@crm/ui/components/drawer"),
	import("@crm/ui/components/command"),
]);
await GlobalRegistrator.unregister();
