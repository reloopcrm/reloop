# Changelog

## [0.22.0](https://github.com/reloopcrm/reloop/compare/v0.21.0...v0.22.0) (2026-10-08)


### Features

* **agent:** read quiet customers early so win back fills in the first session ([#203](https://github.com/reloopcrm/reloop/issues/203)) ([6ca1795](https://github.com/reloopcrm/reloop/commit/6ca1795c98871b4c66b97eaf743c33e6c4650226))
* **connections:** reconnect Google or Microsoft with one button and keep every setting ([#217](https://github.com/reloopcrm/reloop/issues/217)) ([428852d](https://github.com/reloopcrm/reloop/commit/428852dd65f424b49719e8c1e2f913819ee26e92))
* **mailbox:** link every participant of a thread to its contact ([#180](https://github.com/reloopcrm/reloop/issues/180)) ([539a51c](https://github.com/reloopcrm/reloop/commit/539a51c41db6804b5f23280ed5fe4b1bb69da489))
* **usage:** warn at 80 percent of a monthly limit ([#200](https://github.com/reloopcrm/reloop/issues/200)) ([ec706a3](https://github.com/reloopcrm/reloop/commit/ec706a3b5232679c55241ac714ca3001421d1dce))
* **usage:** warn at 80 percent of the contact and mailbox limit ([#220](https://github.com/reloopcrm/reloop/issues/220)) ([b75fe5e](https://github.com/reloopcrm/reloop/commit/b75fe5e3dbe26cdf5e86242f8db048ccf556edca))
* **win-back:** 'remind me in 7 days' hides the person until then, with a Snoozed filter ([#218](https://github.com/reloopcrm/reloop/issues/218)) ([b0c889b](https://github.com/reloopcrm/reloop/commit/b0c889b97686c1ca76616de6d22cdfaf1a92c837))
* **win-back:** a 'replied' filter, a dashboard link to it, and 'Reply to them' on the person page ([#209](https://github.com/reloopcrm/reloop/issues/209)) ([cbcd727](https://github.com/reloopcrm/reloop/commit/cbcd727393e706b4eb4b30cd2ec28887f42d4975))
* **win-back:** a hard no leaves the win-back list, a soft no stays marked as declined ([#212](https://github.com/reloopcrm/reloop/issues/212)) ([9173227](https://github.com/reloopcrm/reloop/commit/9173227888470fae74fcb38040a89c343b79a0f1))
* **win-back:** continue with never starts over and shows the place in the list ([#197](https://github.com/reloopcrm/reloop/issues/197)) ([61a4cba](https://github.com/reloopcrm/reloop/commit/61a4cba2b235eb0e0a83fc18a9eb11fe9f172636))
* **win-back:** out-of-office replies and bounces never count as an answer ([#202](https://github.com/reloopcrm/reloop/issues/202)) ([b5bbfd1](https://github.com/reloopcrm/reloop/commit/b5bbfd1a957325f7b8f99d837b6068f0c7ecea8c))
* **win-back:** prefetch stories for the top of the list and the next person ([#176](https://github.com/reloopcrm/reloop/issues/176)) ([9ceed9b](https://github.com/reloopcrm/reloop/commit/9ceed9bc4e899ba1095613815b3b8b268f35e79f))


### Fixes

* **agent:** a research click also upgrades a task that was claimed but never ran ([#219](https://github.com/reloopcrm/reloop/issues/219)) ([3a8be8c](https://github.com/reloopcrm/reloop/commit/3a8be8cf994f79eabbe572a58e89ae099c86d7ea))
* **agent:** a research click upgrades the waiting automatic task instead of being lost ([#206](https://github.com/reloopcrm/reloop/issues/206)) ([6ebe36d](https://github.com/reloopcrm/reloop/commit/6ebe36d1a7a7d1e6b7eb6c9664cac683b3874106))
* **agent:** lock a fact field and never overwrite a value that changed under the write ([ad89468](https://github.com/reloopcrm/reloop/commit/ad8946835d0c13ec31ef3820ccfb1de040d76ecc))
* **agent:** lock a fact field and never overwrite a value that changed under the write ([#193](https://github.com/reloopcrm/reloop/issues/193)) ([ad89468](https://github.com/reloopcrm/reloop/commit/ad8946835d0c13ec31ef3820ccfb1de040d76ecc))
* **agent:** queue one backfill reading per unread thread instead of moving any open one ([3238368](https://github.com/reloopcrm/reloop/commit/3238368f3ae3cd847dbba046115860673c7c86eb))
* **agent:** queue one backfill reading per unread thread instead of moving any open one ([#183](https://github.com/reloopcrm/reloop/issues/183)) ([3238368](https://github.com/reloopcrm/reloop/commit/3238368f3ae3cd847dbba046115860673c7c86eb))
* **agent:** refund failed research calls, check the Perplexity key before charging, honest recheck results, settle a crashed brand read, parse Perplexity answers, cap the website body, one research config ([#231](https://github.com/reloopcrm/reloop/issues/231)) ([89b22f5](https://github.com/reloopcrm/reloop/commit/89b22f5617ffa48a8edf172b7b4f5d187bc8d3ec))
* **agent:** research active contacts, research every new sync contact, and catch up summary language ([#179](https://github.com/reloopcrm/reloop/issues/179)) ([f8a3f71](https://github.com/reloopcrm/reloop/commit/f8a3f717d02ee5ca9b741bff2d9e6e57f4c7be19))
* **api:** a rate limit per API key on REST and tRPC ([#247](https://github.com/reloopcrm/reloop/issues/247)) ([2923f2e](https://github.com/reloopcrm/reloop/commit/2923f2e9e917f7fe880048aade853ac31518c770))
* **api:** agents.resume and agents.restore accept a session only ([#214](https://github.com/reloopcrm/reloop/issues/214)) ([adeae01](https://github.com/reloopcrm/reloop/commit/adeae0157cd76ec9aaa59cb1e95c6007b9b91c26))
* **api:** check the sign-in allow-list on the export, attachment and profile routes ([29d4fa0](https://github.com/reloopcrm/reloop/commit/29d4fa0faf6e2a96289a6f833becbbfe69a16053))
* **api:** check the sign-in allow-list on the export, attachment and profile routes ([#190](https://github.com/reloopcrm/reloop/issues/190)) ([29d4fa0](https://github.com/reloopcrm/reloop/commit/29d4fa0faf6e2a96289a6f833becbbfe69a16053))
* **api:** close every tenant client when a maintenance script ends ([e18fe19](https://github.com/reloopcrm/reloop/commit/e18fe19635a13fa7fb842eac80225d01fbee5b59))
* **api:** close every tenant client when a maintenance script ends ([#186](https://github.com/reloopcrm/reloop/issues/186)) ([e18fe19](https://github.com/reloopcrm/reloop/commit/e18fe19635a13fa7fb842eac80225d01fbee5b59))
* **api:** write no dash in API messages so English users see none ([a37b25b](https://github.com/reloopcrm/reloop/commit/a37b25ba689e92bbe4b218c38f179b33653ccff1))
* **api:** write no dash in API messages so English users see none ([#182](https://github.com/reloopcrm/reloop/issues/182)) ([a37b25b](https://github.com/reloopcrm/reloop/commit/a37b25ba689e92bbe4b218c38f179b33653ccff1))
* **attention:** let a decline win over a quiet contact so it never reads Write again ([#196](https://github.com/reloopcrm/reloop/issues/196)) ([3400488](https://github.com/reloopcrm/reloop/commit/34004880651a4ac51b28575be4a71e74b6e72223))
* **auth:** a custom workspace slug survives every sign-in ([#243](https://github.com/reloopcrm/reloop/issues/243)) ([73e55a1](https://github.com/reloopcrm/reloop/commit/73e55a18374fb17de648ff330c7a51a2f0c507e7))
* **calendar:** cancelled, moved and uninvited Google events update the timeline, and large calendars sync over several ticks ([#240](https://github.com/reloopcrm/reloop/issues/240)) ([2383125](https://github.com/reloopcrm/reloop/commit/238312518fa72cedad874338768611b4c0c06a87))
* **chat:** a builder message is never sent to the agent twice when the status write fails ([#235](https://github.com/reloopcrm/reloop/issues/235)) ([b5c80a1](https://github.com/reloopcrm/reloop/commit/b5c80a1dc7554f46886e593e0b9af4f39a4ff0ae))
* **connections:** show a stopped mailbox as needing attention and translate connect and sync errors ([5bc0d21](https://github.com/reloopcrm/reloop/commit/5bc0d211f1823853c0a3f4512fee30e4b5b726b1))
* **connections:** show a stopped mailbox as needing attention and translate connect and sync errors ([#191](https://github.com/reloopcrm/reloop/issues/191)) ([5bc0d21](https://github.com/reloopcrm/reloop/commit/5bc0d211f1823853c0a3f4512fee30e4b5b726b1))
* **contacts:** creating a contact returns 409 for a duplicate or suppressed address and 400 for an unknown company or owner ([#246](https://github.com/reloopcrm/reloop/issues/246)) ([fbed9d4](https://github.com/reloopcrm/reloop/commit/fbed9d4e61f55426bb7bd621bfb4427963e931f3))
* **currency:** hide stale base amounts and stop counting amountless deals as unconverted ([#195](https://github.com/reloopcrm/reloop/issues/195)) ([15c0a86](https://github.com/reloopcrm/reloop/commit/15c0a860ca27cd0dc2ece1b7adf2f5c68a6b21fc))
* **db:** bun install works in a fresh checkout without .env ([#205](https://github.com/reloopcrm/reloop/issues/205)) ([ab43641](https://github.com/reloopcrm/reloop/commit/ab436411a0a81eac5e22a238e970454e1bc786ce))
* **db:** count only research sessions that ran in the monthly usage ([29ae624](https://github.com/reloopcrm/reloop/commit/29ae624b523535f66c24c842e4ae030dc0cbf8b2))
* **db:** count only research sessions that ran in the monthly usage ([#181](https://github.com/reloopcrm/reloop/issues/181)) ([29ae624](https://github.com/reloopcrm/reloop/commit/29ae624b523535f66c24c842e4ae030dc0cbf8b2))
* **db:** db:generate and build work without DATABASE_URL ([#215](https://github.com/reloopcrm/reloop/issues/215)) ([8731b8e](https://github.com/reloopcrm/reloop/commit/8731b8e8752684ac9d6ebc18dd9e85d012bc0f5a))
* **db:** load the root .env and resolve prisma without PATH in db:test ([3ff91fe](https://github.com/reloopcrm/reloop/commit/3ff91fe516428320a3ef3dde867ce568762ceb26))
* **db:** load the root .env and resolve prisma without PATH in db:test ([#189](https://github.com/reloopcrm/reloop/issues/189)) ([3ff91fe](https://github.com/reloopcrm/reloop/commit/3ff91fe516428320a3ef3dde867ce568762ceb26))
* **db:** run prisma generate through the running bun binary so the image build works without bunx ([#210](https://github.com/reloopcrm/reloop/issues/210)) ([62ea786](https://github.com/reloopcrm/reloop/commit/62ea7865975e55c051c4f4f83e65062bfba212aa))
* **deals:** leave archived deals out of the dashboard, the unconverted count and the company and contact sheets ([93973ec](https://github.com/reloopcrm/reloop/commit/93973ec2400a7235229624e8d4fbf6fc09be825c))
* **deals:** leave archived deals out of the dashboard, the unconverted count and the company and contact sheets ([#194](https://github.com/reloopcrm/reloop/issues/194)) ([93973ec](https://github.com/reloopcrm/reloop/commit/93973ec2400a7235229624e8d4fbf6fc09be825c))
* **deals:** one open deal per quote, clean contacts on company change, reasons on closed stages, no stage change on archived deals ([#224](https://github.com/reloopcrm/reloop/issues/224)) ([38222fc](https://github.com/reloopcrm/reloop/commit/38222fc7a088103870671a2b06c15441413a0d54))
* **exports:** no formula injection in CSV headers, names for person fields, and a visible failure when the export breaks ([#237](https://github.com/reloopcrm/reloop/issues/237)) ([98fc909](https://github.com/reloopcrm/reloop/commit/98fc909fb3a919963af04c92f54e6928d33d70e7))
* **imap:** re-read history when a creating rule is turned on ([cac17c4](https://github.com/reloopcrm/reloop/commit/cac17c42b02f74c8d938314fac7b764c86da5b9e))
* **imap:** re-read history when a creating rule is turned on ([#187](https://github.com/reloopcrm/reloop/issues/187)) ([cac17c4](https://github.com/reloopcrm/reloop/commit/cac17c42b02f74c8d938314fac7b764c86da5b9e))
* **mailbox:** add every sender of a relevant thread from the company domain as a contact ([#177](https://github.com/reloopcrm/reloop/issues/177)) ([28165bb](https://github.com/reloopcrm/reloop/commit/28165bbc3192117904dbd14a5e07a352d7fb74e0))
* **mailbox:** count real-answer text in code points and match JS whitespace in SQL ([#232](https://github.com/reloopcrm/reloop/issues/232)) ([0921ae1](https://github.com/reloopcrm/reloop/commit/0921ae1b749a01fe889fc32e3b1b722d2154a25d))
* **mailbox:** parse Gmail, Calendar and Graph responses with Zod at the client ([83b0fc8](https://github.com/reloopcrm/reloop/commit/83b0fc80369dd60841ce1cdd9ee6afa5f5ed3097))
* **mailbox:** parse Gmail, Calendar and Graph responses with Zod at the client ([#192](https://github.com/reloopcrm/reloop/issues/192)) ([83b0fc8](https://github.com/reloopcrm/reloop/commit/83b0fc80369dd60841ce1cdd9ee6afa5f5ed3097))
* **mailbox:** skip a message the store keeps rejecting after three attempts so the cursor moves on ([#188](https://github.com/reloopcrm/reloop/issues/188)) ([c327b83](https://github.com/reloopcrm/reloop/commit/c327b83d61b3e22a4ae8d75e51188dd7bbd26b40))
* **mailbox:** walk a cursor past relevant threads that are not worth adopting ([700266e](https://github.com/reloopcrm/reloop/commit/700266e92d70db694508d4fc029df683fffe6605))
* **mailbox:** walk a cursor past relevant threads that are not worth adopting ([#185](https://github.com/reloopcrm/reloop/issues/185)) ([700266e](https://github.com/reloopcrm/reloop/commit/700266e92d70db694508d4fc029df683fffe6605))
* **onboarding:** explain a cancelled Google grant, open the dashboard for manual records, no spinner without AI, reserve every route slug ([#228](https://github.com/reloopcrm/reloop/issues/228)) ([f1bae44](https://github.com/reloopcrm/reloop/commit/f1bae442f0692f65fd6046ee5ed62e5dd69bd08d))
* **quotes:** the quotes list is a data table with phone cards and no sideways scroll ([#230](https://github.com/reloopcrm/reloop/issues/230)) ([7c2cec9](https://github.com/reloopcrm/reloop/commit/7c2cec9132154919fada059e0c71b0685dd10ba7))
* **search:** quick search hides archived records, finds full names, and shows a loading state ([#239](https://github.com/reloopcrm/reloop/issues/239)) ([f2ac600](https://github.com/reloopcrm/reloop/commit/f2ac600680889460db4ad9f9815756d9ad28cfc4))
* **security:** refuse API keys on agent code changes and end sessions and keys when a sign-in grant is revoked ([#198](https://github.com/reloopcrm/reloop/issues/198)) ([c299e7d](https://github.com/reloopcrm/reloop/commit/c299e7d82da0f5e5b7d9b0a37b07beed6d44af21))
* **security:** stub the grant lookup in the two session tests and run every security group ([#207](https://github.com/reloopcrm/reloop/issues/207)) ([c261f4d](https://github.com/reloopcrm/reloop/commit/c261f4d24d9071aaff54a98f514c64a3530b80ab))
* **slack:** the agent can never notify a whole channel or a person through injected text ([#238](https://github.com/reloopcrm/reloop/issues/238)) ([4a28832](https://github.com/reloopcrm/reloop/commit/4a288329ca43057a5ff7075a1863bd6b6254a07c))
* **test:** hold the demo lock before asserting and close every seed transaction ([#223](https://github.com/reloopcrm/reloop/issues/223)) ([eb43c2b](https://github.com/reloopcrm/reloop/commit/eb43c2b7e7ce815ed8408fadbe5b990c7cf04171))
* **test:** make the suites that time out under load deterministic ([#221](https://github.com/reloopcrm/reloop/issues/221)) ([237814f](https://github.com/reloopcrm/reloop/commit/237814f244ccca5651accc34bd8e38064ed6b3f3))
* **test:** the enrichment queue spec finds its own rows behind a full page of other open tasks ([#245](https://github.com/reloopcrm/reloop/issues/245)) ([a6b456d](https://github.com/reloopcrm/reloop/commit/a6b456d8edeb9c4faa9e25ad31ef9166992401dc))
* **tracking:** parse the collector batch with Zod and drop bad events quietly ([#208](https://github.com/reloopcrm/reloop/issues/208)) ([4a4acf4](https://github.com/reloopcrm/reloop/commit/4a4acf44c63fc1cedbfdfa1cf3ac4dea638bee93))
* **ui:** open a clickable table row with Enter or Space ([#229](https://github.com/reloopcrm/reloop/issues/229)) ([cb67d88](https://github.com/reloopcrm/reloop/commit/cb67d8839aaf33adc3dff3588a56682019381c4d))
* **webhooks:** require https for webhook addresses and show no secret characters ([#242](https://github.com/reloopcrm/reloop/issues/242)) ([7fc132b](https://github.com/reloopcrm/reloop/commit/7fc132b35dfba95d34bc18af068c9460019b3325))
* **win-back:** count only people with an address in the place in the list ([#204](https://github.com/reloopcrm/reloop/issues/204)) ([183189d](https://github.com/reloopcrm/reloop/commit/183189d35ecf9adcd48cf768ea9d5678ee11d182))
* **win-back:** removed members get no follow-up tasks, and rule defaults come from one place ([#248](https://github.com/reloopcrm/reloop/issues/248)) ([ef69152](https://github.com/reloopcrm/reloop/commit/ef6915214ca236638b5a2adb94ce0d051aa53b4f))
* **win-back:** show every rejected person in Not for us regardless of the include rules ([e5b7f81](https://github.com/reloopcrm/reloop/commit/e5b7f810e08a7bdb4cd1a7cf5c9c8d75065e8f66))
* **win-back:** show every rejected person in Not for us regardless of the include rules ([#184](https://github.com/reloopcrm/reloop/issues/184)) ([e5b7f81](https://github.com/reloopcrm/reloop/commit/e5b7f810e08a7bdb4cd1a7cf5c9c8d75065e8f66))
* **win-back:** the 'answered' card and its filtered list show the same people ([#222](https://github.com/reloopcrm/reloop/issues/222)) ([de3e61f](https://github.com/reloopcrm/reloop/commit/de3e61f88f51dcfa75005c72ccefc49717efc8e1))


### Performance

* **win-back:** store a real-answer flag per mail so the replied filter stops running a regex over every mail ([#216](https://github.com/reloopcrm/reloop/issues/216)) ([dbcaaea](https://github.com/reloopcrm/reloop/commit/dbcaaea72b17d088d1c1cb6f880e0cbb26562bcb))


### Refactors

* move tunable constants into the area config and drop code comments ([#199](https://github.com/reloopcrm/reloop/issues/199)) ([054baf0](https://github.com/reloopcrm/reloop/commit/054baf038d89ab2d5188bc4737bec89dca79fb78))
* the open core reads plan limits through a cloud slot ([#211](https://github.com/reloopcrm/reloop/issues/211)) ([a36d3df](https://github.com/reloopcrm/reloop/commit/a36d3df5242115a49599813e4a4cf5bad2141906))


### Documentation

* describe the open core, not the hosted cloud ([#201](https://github.com/reloopcrm/reloop/issues/201)) ([97cf785](https://github.com/reloopcrm/reloop/commit/97cf78570162b854b3de4a7406500e826c4ac787))

## [0.21.0](https://github.com/reloopcrm/reloop/compare/v0.20.0...v0.21.0) (2026-10-03)


### Features

* **agent:** a cheap pre-check before automatic identify research ([#137](https://github.com/reloopcrm/reloop/issues/137)) ([cf39046](https://github.com/reloopcrm/reloop/commit/cf39046cf2a645011d7c697393d7c48905f3349c))
* **agent:** drafts continue the conversation in the user's own voice ([#138](https://github.com/reloopcrm/reloop/issues/138)) ([6cbe998](https://github.com/reloopcrm/reloop/commit/6cbe9984062a2287de2c40b6406932d97bf54d09))
* **agent:** learn a mailbox profile per workspace ([#139](https://github.com/reloopcrm/reloop/issues/139)) ([07e1d66](https://github.com/reloopcrm/reloop/commit/07e1d66e9a7a6b387339d38b46c841ba74648cc1))
* **agent:** offer GPT-6 Astra, Sol and Luna on a ChatGPT subscription ([#102](https://github.com/reloopcrm/reloop/issues/102)) ([b82cc14](https://github.com/reloopcrm/reloop/commit/b82cc1478886cc278680da670cf8fac749557c3f))
* **agent:** Sol moves to GPT-6.1 on the fixed AI, OpenRouter and ChatGPT ([#127](https://github.com/reloopcrm/reloop/issues/127)) ([522e095](https://github.com/reloopcrm/reloop/commit/522e095596dce90182d5346afd949c0840e004bd))
* **agent:** the agent writes in the language of each workspace ([#84](https://github.com/reloopcrm/reloop/issues/84)) ([d157c36](https://github.com/reloopcrm/reloop/commit/d157c369a09b952e7c4d641f6f909fc47787c542))
* **agent:** the fixed AI and the OpenRouter defaults move to GPT-6 Luna and Sol ([#73](https://github.com/reloopcrm/reloop/issues/73)) ([1b176d9](https://github.com/reloopcrm/reloop/commit/1b176d91e2a9fb7a17232b06dc5574ca21707824))
* **agent:** write the win back story of one quiet customer ([#171](https://github.com/reloopcrm/reloop/issues/171)) ([bb1a9ce](https://github.com/reloopcrm/reloop/commit/bb1a9ceadc1895df3aad04ec7cb52d7d7fefa93c))
* **api:** demo data that fits any business, not only freight ([#122](https://github.com/reloopcrm/reloop/issues/122)) ([046aaf0](https://github.com/reloopcrm/reloop/commit/046aaf0b905a71225c89fc4010712014494f3edc))
* **api:** one call returns the Win back person view ([#172](https://github.com/reloopcrm/reloop/issues/172)) ([0360d8a](https://github.com/reloopcrm/reloop/commit/0360d8ad085ab561f0cf227bcc7dd9660c993c91))
* **api:** plan and add-on changes are what Stripe bills, paying ends the trial, AI caps, and billing mails ([#85](https://github.com/reloopcrm/reloop/issues/85)) ([9ce0c41](https://github.com/reloopcrm/reloop/commit/9ce0c415f1dc7bacc5427ed00175757f89c86b3c))
* **api:** sample data with a German and an international roster, and new product shots ([#165](https://github.com/reloopcrm/reloop/issues/165)) ([e888312](https://github.com/reloopcrm/reloop/commit/e888312f70c8f16c58d3aca4dd15619ba195d155))
* **api:** the owner deletes a hosted workspace for good ([#96](https://github.com/reloopcrm/reloop/issues/96)) ([26e6dbf](https://github.com/reloopcrm/reloop/commit/26e6dbf89a66e37a8a838026f1f826f8ceee8065))
* **app:** an agreement slot in the workspace layout ([#170](https://github.com/reloopcrm/reloop/issues/170)) ([03c5736](https://github.com/reloopcrm/reloop/commit/03c57367586918ba4633d6574eac2ef6002c5eba))
* **app:** companies and contacts lists in the new app design ([#158](https://github.com/reloopcrm/reloop/issues/158)) ([3476227](https://github.com/reloopcrm/reloop/commit/3476227a729573e802b1aeff4bd5ed90bcf77a4f))
* **app:** contact activity reads as a story, mails expand in place ([#79](https://github.com/reloopcrm/reloop/issues/79)) ([94bc953](https://github.com/reloopcrm/reloop/commit/94bc95388ee32bfe7ece5e3ae35568754d9b7a3d))
* **app:** contacts, companies, the record sheets and a deals pipeline in the pill design ([#76](https://github.com/reloopcrm/reloop/issues/76)) ([efb0a28](https://github.com/reloopcrm/reloop/commit/efb0a282a91cda1a70de4be1b0b0d658bcfd5ad5))
* **app:** deals board, lists and overview in the new app design ([#159](https://github.com/reloopcrm/reloop/issues/159)) ([6cf00b9](https://github.com/reloopcrm/reloop/commit/6cf00b964500517926a7b976f653bfebc7fd2dd1))
* **app:** docs with a page outline and copy buttons ([#146](https://github.com/reloopcrm/reloop/issues/146)) ([be1cc5d](https://github.com/reloopcrm/reloop/commit/be1cc5d8dec19015814fb160dce7057e1b9f9f6e))
* **app:** entry pages link to the marketing site and to each other ([#80](https://github.com/reloopcrm/reloop/issues/80)) ([2d04548](https://github.com/reloopcrm/reloop/commit/2d04548d5d378997c3a7d58a9c8b123e4e06df7f))
* **app:** every entry page in the split layout ([#68](https://github.com/reloopcrm/reloop/issues/68)) ([45a03e1](https://github.com/reloopcrm/reloop/commit/45a03e19fccac3d908b2b27542c32d1aefe28369))
* **app:** hide domain, industry and position columns by default ([#135](https://github.com/reloopcrm/reloop/issues/135)) ([7e61bba](https://github.com/reloopcrm/reloop/commit/7e61bbae84d36325e0f82470085f08a1bbe18455))
* **app:** overview and win back in the pill design, with a win-back count in the sidebar ([#74](https://github.com/reloopcrm/reloop/issues/74)) ([c67df07](https://github.com/reloopcrm/reloop/commit/c67df079542c5025ca7fe15702092376e44c42d1))
* **app:** product screenshots with sample data ([#147](https://github.com/reloopcrm/reloop/issues/147)) ([41f5076](https://github.com/reloopcrm/reloop/commit/41f50768505987faa6999d07556dd62425263acc))
* **app:** record sheets, chat home and settings sidebar in the new app design ([#160](https://github.com/reloopcrm/reloop/issues/160)) ([9648887](https://github.com/reloopcrm/reloop/commit/9648887ddb80a4a10934a821fc4c9e31ec39cfca))
* **app:** sample stories and new Win back product shots ([#174](https://github.com/reloopcrm/reloop/issues/174)) ([c668ebe](https://github.com/reloopcrm/reloop/commit/c668ebe8805367efaa474f3b44d9c48167eea380))
* **app:** settings, agents and chat in the pill and hairline design ([#75](https://github.com/reloopcrm/reloop/issues/75)) ([80f6aa5](https://github.com/reloopcrm/reloop/commit/80f6aa595d68fd6e4ae40431252690204a6852b5))
* **app:** sign-in, onboarding and grant access in the site design ([#148](https://github.com/reloopcrm/reloop/issues/148)) ([7160c97](https://github.com/reloopcrm/reloop/commit/7160c97782abe08289c8ab8f7ca0c58b66ac307b))
* **app:** the new site header and footer ([#145](https://github.com/reloopcrm/reloop/issues/145)) ([20390bd](https://github.com/reloopcrm/reloop/commit/20390bdf7ef937300c509a54cb391cd8fc8cd8b1))
* **app:** the Win back person view ([#173](https://github.com/reloopcrm/reloop/issues/173)) ([816ecdd](https://github.com/reloopcrm/reloop/commit/816ecdda7401dd72011fe6b90724525761599f61))
* **app:** warn before a plan without AI, and refuse a plan too small for the workspace ([#78](https://github.com/reloopcrm/reloop/issues/78)) ([87c7528](https://github.com/reloopcrm/reloop/commit/87c75281933785d0b16c401b5eb61964b938115c))
* **app:** win back list in the new app design ([#157](https://github.com/reloopcrm/reloop/issues/157)) ([03ce9a0](https://github.com/reloopcrm/reloop/commit/03ce9a06a9f10853224ff664c801bd844e1e24a7))
* **app:** Win back person shots for the landing page ([#175](https://github.com/reloopcrm/reloop/issues/175)) ([1b779f6](https://github.com/reloopcrm/reloop/commit/1b779f62cd1cbc8fd7fd86c77499c100c7161ec5))
* **billing:** a downgrade waits for the paid period, an upgrade is billed now ([#89](https://github.com/reloopcrm/reloop/issues/89)) ([06f4af2](https://github.com/reloopcrm/reloop/commit/06f4af24763f93367123149e06b6a146b2153126))
* **billing:** show the saved VAT ID and let the portal change it ([#95](https://github.com/reloopcrm/reloop/issues/95)) ([038a7b3](https://github.com/reloopcrm/reloop/commit/038a7b324d7a240cbc52047c1fc83519303cbd7c))
* **contacts:** the new contact dialog takes a phone number ([#108](https://github.com/reloopcrm/reloop/issues/108)) ([3e1b083](https://github.com/reloopcrm/reloop/commit/3e1b0837c3e0e3707047d48a848b6ed355379d96))
* **db:** a stored win back story per contact and its task kind ([#169](https://github.com/reloopcrm/reloop/issues/169)) ([adbfe07](https://github.com/reloopcrm/reloop/commit/adbfe0797574dfe816e796dc05bb6b4d47bf7b61))
* **db:** mailbox profile columns and active-only contact limit ([#136](https://github.com/reloopcrm/reloop/issues/136)) ([ce050ed](https://github.com/reloopcrm/reloop/commit/ce050ed32b824b658c6a60a69a3671df9350262c))
* **landing:** a dynamic island nav floats over the desktop site ([#90](https://github.com/reloopcrm/reloop/issues/90)) ([333e510](https://github.com/reloopcrm/reloop/commit/333e510acffbebf62487703f8ea2e6faeacb0ecf))
* **landing:** a hero video plays under the headline, German or English ([#86](https://github.com/reloopcrm/reloop/issues/86)) ([282d993](https://github.com/reloopcrm/reloop/commit/282d993c54898c805d8f418aec1bc92caf7252d4))
* **landing:** a separate 3D test page at /test/3d ([#117](https://github.com/reloopcrm/reloop/issues/117)) ([2e97ef0](https://github.com/reloopcrm/reloop/commit/2e97ef05fedc9b262028cc5381b9c31808d70500))
* **landing:** a win back page replaces the freight forwarding page ([#82](https://github.com/reloopcrm/reloop/issues/82)) ([07472a2](https://github.com/reloopcrm/reloop/commit/07472a2fba9932d0ceb6cbb716de223a921c0277))
* **landing:** an imprint read from server settings, kept out of search ([#115](https://github.com/reloopcrm/reloop/issues/115)) ([f35c874](https://github.com/reloopcrm/reloop/commit/f35c874add94de47234f54fbcbe5b873da5965f3))
* **landing:** buy a plan directly from the pricing page ([#92](https://github.com/reloopcrm/reloop/issues/92)) ([624aacf](https://github.com/reloopcrm/reloop/commit/624aacf633f867e6857d7c1db2b77a1ec671df43))
* **landing:** the pricing page asks three questions and shows the plan that fits ([#83](https://github.com/reloopcrm/reloop/issues/83)) ([24e7a64](https://github.com/reloopcrm/reloop/commit/24e7a64935c6b03045f1ece66cc0000a25cb6111))
* **landing:** the public pages on the design foundation ([#72](https://github.com/reloopcrm/reloop/issues/72)) ([4122bd2](https://github.com/reloopcrm/reloop/commit/4122bd261f5d0ca04520103d61de1d1abe5d5603))
* **members:** an owner or admin can remove a member from the workspace ([#109](https://github.com/reloopcrm/reloop/issues/109)) ([aedf0ff](https://github.com/reloopcrm/reloop/commit/aedf0ff25ab0db7b87843bc1227a108b128c4c69))
* run company research only on request ([#132](https://github.com/reloopcrm/reloop/issues/132)) ([5016d33](https://github.com/reloopcrm/reloop/commit/5016d3313ceae0b9c109ff0b382313ffa0a1a759))
* **ui:** a token scope for the public site ([#144](https://github.com/reloopcrm/reloop/issues/144)) ([8a30d96](https://github.com/reloopcrm/reloop/commit/8a30d9634131bdd57abd8219f99566e25254062a))
* **ui:** app tokens, controls and shell in the site design ([#155](https://github.com/reloopcrm/reloop/issues/155)) ([4ebf46b](https://github.com/reloopcrm/reloop/commit/4ebf46b8afb610e7db39a1852484aa23d52ffe7d))
* **ui:** Attio-style list table with fixed columns, selection bar and pages ([#156](https://github.com/reloopcrm/reloop/issues/156)) ([a027125](https://github.com/reloopcrm/reloop/commit/a027125e1e4285b4da2b93aa27bd9b36c47e5a97))
* **ui:** pill controls, lime segments and a labelled sidebar as the design foundation ([#71](https://github.com/reloopcrm/reloop/issues/71)) ([3a1a774](https://github.com/reloopcrm/reloop/commit/3a1a774b170c2b2f0d6703953a4ef122133b36a2))
* **ui:** site tokens and controls for the public pages ([#150](https://github.com/reloopcrm/reloop/issues/150)) ([1f54ce0](https://github.com/reloopcrm/reloop/commit/1f54ce04104a5c24befffcd87c24b7ea31874720))


### Fixes

* **agent:** count every started research session against the hourly limit ([#133](https://github.com/reloopcrm/reloop/issues/133)) ([97d4a42](https://github.com/reloopcrm/reloop/commit/97d4a429aa11352e5075a2453d4dd7c9e5d8427c))
* **agent:** language refresh keeps relevance and does not count ([#164](https://github.com/reloopcrm/reloop/issues/164)) ([6e6883a](https://github.com/reloopcrm/reloop/commit/6e6883aa7a0f5db99689a0a0579d699e27ce285b))
* **agent:** never treat a freemail domain as the workspace's own ([#128](https://github.com/reloopcrm/reloop/issues/128)) ([29327cc](https://github.com/reloopcrm/reloop/commit/29327ccc9684c0c687ac30f5427a0cb7f63c03a0))
* **agent:** record model usage inside the caller's tenant ([#131](https://github.com/reloopcrm/reloop/issues/131)) ([cb1dfa8](https://github.com/reloopcrm/reloop/commit/cb1dfa83bc4698a9f77f1e966a730d0ea893d6f7))
* **agent:** research tasks run as task sessions and no longer park for 30 days ([#113](https://github.com/reloopcrm/reloop/issues/113)) ([c4da098](https://github.com/reloopcrm/reloop/commit/c4da098b8eea0c1f0d62fd4041a1c8f60317e8fc))
* **api:** an empty optional env var counts as unset ([#69](https://github.com/reloopcrm/reloop/issues/69)) ([f44a638](https://github.com/reloopcrm/reloop/commit/f44a6383f00c20b61d056b4fe3a66ce51012768d))
* **api:** keep mailbox sync safe at the contact limit and across Gmail history ([#130](https://github.com/reloopcrm/reloop/issues/130)) ([addc7f7](https://github.com/reloopcrm/reloop/commit/addc7f75a2e1977caa416741f65b553832a2f2d9))
* **api:** reserve part of the AI budget for new mail ([#129](https://github.com/reloopcrm/reloop/issues/129)) ([bab2cc2](https://github.com/reloopcrm/reloop/commit/bab2cc267e912d87e6920419257f739231285ae0))
* **api:** scheduled billing changes edit one target instead of overwriting each other ([#94](https://github.com/reloopcrm/reloop/issues/94)) ([5815695](https://github.com/reloopcrm/reloop/commit/581569526ffffa09dc22ce7ac6a7c8caaa8b8369))
* **api:** the sweep names every unfinished signup it removes ([#121](https://github.com/reloopcrm/reloop/issues/121)) ([fb8ce73](https://github.com/reloopcrm/reloop/commit/fb8ce73e38837db99b9209dd52b53b0b481e6560))
* **app:** a signed-in visitor on the sign-up page gets their workspace, not a second one ([#97](https://github.com/reloopcrm/reloop/issues/97)) ([35c63f9](https://github.com/reloopcrm/reloop/commit/35c63f961e0e830f3279f272b6081d59c56ea537))
* **app:** align the add-on stepper and bill it by interval ([#93](https://github.com/reloopcrm/reloop/issues/93)) ([50d8468](https://github.com/reloopcrm/reloop/commit/50d8468afa0e43cb2ee316c34ea6fae64f1d5228))
* **app:** align the overview grid ([#162](https://github.com/reloopcrm/reloop/issues/162)) ([ab75720](https://github.com/reloopcrm/reloop/commit/ab75720b3637d6c58b4998a1744475b04480c056))
* **app:** eight small UI bugs across hydration, prerendering and mobile layout ([#100](https://github.com/reloopcrm/reloop/issues/100)) ([f20e527](https://github.com/reloopcrm/reloop/commit/f20e527b3a9c777082a03460a3e091344744b400))
* **app:** no redirect loop, no dead buy button, no pricing defaults in the open-source build ([acacc5f](https://github.com/reloopcrm/reloop/commit/acacc5f323104c8be1f03b6a2d81314190400864))
* **app:** public pages render without JavaScript ([#149](https://github.com/reloopcrm/reloop/issues/149)) ([221658e](https://github.com/reloopcrm/reloop/commit/221658ee96c97fbcb6f65aee60163f9589fb9c40))
* **app:** ship the docs markdown in the app image ([#142](https://github.com/reloopcrm/reloop/issues/142)) ([358e66c](https://github.com/reloopcrm/reloop/commit/358e66ca5074fec23121ddd035afa0307c2f8bcc))
* **app:** win back shots show only long-quiet customers, totals in whole units ([#166](https://github.com/reloopcrm/reloop/issues/166)) ([81a6ef0](https://github.com/reloopcrm/reloop/commit/81a6ef064dd1f9e903c1e48db26825b3dcc7c45f))
* **billing:** heal a lost scheduled change in the daily sweep, and mail every scheduled target ([#99](https://github.com/reloopcrm/reloop/issues/99)) ([8aef86d](https://github.com/reloopcrm/reloop/commit/8aef86dd0066bf27f514500ff2518b42efe4af78))
* **billing:** treat Stripe ids that Stripe does not have as none ([#114](https://github.com/reloopcrm/reloop/issues/114)) ([9eddd14](https://github.com/reloopcrm/reloop/commit/9eddd140ef637c81be971adbf9dc75ba3478f8d1))
* **cloud:** hide the sign-in credentials card and the waitlist page on Reloop Cloud ([#101](https://github.com/reloopcrm/reloop/issues/101)) ([c9b6735](https://github.com/reloopcrm/reloop/commit/c9b673576c36941568912a8c303bfdf1326db120))
* **contacts:** a search for a full name finds the person ([#110](https://github.com/reloopcrm/reloop/issues/110)) ([578b7c5](https://github.com/reloopcrm/reloop/commit/578b7c56ec5635c66317ef0041c116477f646943))
* **contacts:** sorting by name orders by first name, as the table shows it ([#111](https://github.com/reloopcrm/reloop/issues/111)) ([db90cae](https://github.com/reloopcrm/reloop/commit/db90caed2372c36cd523c53eba2476477cb8dd20))
* **deals:** the offer column in quotes from mail is one short line ([#103](https://github.com/reloopcrm/reloop/issues/103)) ([acb47f4](https://github.com/reloopcrm/reloop/commit/acb47f442d5fc4e8870e4651de9afd9f90b6cf7a))
* **deals:** the quotes table keeps its action column inside the box ([#105](https://github.com/reloopcrm/reloop/issues/105)) ([1f16e9d](https://github.com/reloopcrm/reloop/commit/1f16e9d1bf129742c11e33323c0e958edae52778))
* **i18n:** consistent German wording on the public site ([#152](https://github.com/reloopcrm/reloop/issues/152)) ([7f2451e](https://github.com/reloopcrm/reloop/commit/7f2451e04147fe7a1cbe06bac345a5aabfa14408))
* **i18n:** footer heading reads Unternehmen in German ([#153](https://github.com/reloopcrm/reloop/issues/153)) ([d191420](https://github.com/reloopcrm/reloop/commit/d191420d309bba59e5082aa554cbc0e6e0d889f0))
* **landing:** fill privacy and contact from getImprint, keep the operator out of search ([#116](https://github.com/reloopcrm/reloop/issues/116)) ([f6cfa97](https://github.com/reloopcrm/reloop/commit/f6cfa9773e115a382788ed7a51a263a440b6c085))
* **landing:** hero and mailbox band fit the first screen, no change button, no storage add-on ([#81](https://github.com/reloopcrm/reloop/issues/81)) ([728003f](https://github.com/reloopcrm/reloop/commit/728003fae8f7f68e650d9c97348c6ab9af596a3c))
* **landing:** the hero video swaps with the language ([#87](https://github.com/reloopcrm/reloop/issues/87)) ([f7782ac](https://github.com/reloopcrm/reloop/commit/f7782ac90a83820f1f4a5154bb03aff08fed670a))
* **landing:** the island fits every language and starts compact on a scrolled reload ([#91](https://github.com/reloopcrm/reloop/issues/91)) ([d45299e](https://github.com/reloopcrm/reloop/commit/d45299e5d26f5fa09884da09f5d3ec90905fb7da))
* **mailbox:** direction from every own address, orphan mailbox rows ([#141](https://github.com/reloopcrm/reloop/issues/141)) ([5373ac9](https://github.com/reloopcrm/reloop/commit/5373ac9ea0c93f2d3177af0124348c25419ca43c))
* **settings:** the TypeSafe card no longer tells a cloud customer about TYPESAFE_API_KEY ([#104](https://github.com/reloopcrm/reloop/issues/104)) ([68c9dc7](https://github.com/reloopcrm/reloop/commit/68c9dc7a6e9bc59965a06b9b84cf42086b5fb398))
* **site:** slimmer top navigation ([#154](https://github.com/reloopcrm/reloop/issues/154)) ([2190823](https://github.com/reloopcrm/reloop/commit/2190823a5725a5386098ca4f6b777ca07cee322b))
* take contact names and details from the sender name and signature ([#134](https://github.com/reloopcrm/reloop/issues/134)) ([aa43333](https://github.com/reloopcrm/reloop/commit/aa433333cc1462348e557a1a8818109a1f5d48a2))
* **tenancy:** the workspace lookup is limited per network address, not per email ([#107](https://github.com/reloopcrm/reloop/issues/107)) ([6578939](https://github.com/reloopcrm/reloop/commit/65789393854d8b97d614955a3a01cb6d1b5331c5))
* **timeline:** summaries in the user's language, newest message first ([#163](https://github.com/reloopcrm/reloop/issues/163)) ([631dea4](https://github.com/reloopcrm/reloop/commit/631dea4b42aa89a7ad4485104f5fb8ac1faf6e08))
* trial limits count from the day the trial started ([#123](https://github.com/reloopcrm/reloop/issues/123)) ([efff4de](https://github.com/reloopcrm/reloop/commit/efff4de98aa25a503e53a9588635b3369978b6d4))
* **ui:** a list page past the end goes to the last page ([#168](https://github.com/reloopcrm/reloop/issues/168)) ([4cc5cfd](https://github.com/reloopcrm/reloop/commit/4cc5cfd207623850ca7d3479e57b84397efa4c6e))
* **ui:** a table column is never narrower than its heading ([#106](https://github.com/reloopcrm/reloop/issues/106)) ([77b6528](https://github.com/reloopcrm/reloop/commit/77b65285b0542f7cd4d4ac3b342c381b72ae17db))
* **ui:** table action cells keep their control, the sidebar keeps only the wordmark ([#77](https://github.com/reloopcrm/reloop/issues/77)) ([782b22b](https://github.com/reloopcrm/reloop/commit/782b22bf3444bafd941436c61a944013c36b0723))
* **win-back:** potential groups stay in order across pages ([#167](https://github.com/reloopcrm/reloop/issues/167)) ([4bd2552](https://github.com/reloopcrm/reloop/commit/4bd255208b76a65dd979b0aee89ef11ce6caa5aa))


### Refactors

* a cloud scope port between the core and the tenancy ([#124](https://github.com/reloopcrm/reloop/issues/124)) ([095af46](https://github.com/reloopcrm/reloop/commit/095af4655dd1029161b7cec1c177e1c946ceed65))
* a seam between the open-source core and the hosted cloud ([#119](https://github.com/reloopcrm/reloop/issues/119)) ([a3a1dbc](https://github.com/reloopcrm/reloop/commit/a3a1dbce26a2933f2a5a2e7a7bdc1fa9863488de))
* **app:** drop the old landing blocks ([#151](https://github.com/reloopcrm/reloop/issues/151)) ([decc5eb](https://github.com/reloopcrm/reloop/commit/decc5eb89b948fce9f2f0d17cc40fdb87684eabb))
* move billing and the marketing site into the private cloud overlay ([4f8b2e8](https://github.com/reloopcrm/reloop/commit/4f8b2e86d00d9033df3042bbb8cf968343ef4c7b))
* move billing and the marketing site into the private cloud overlay ([#120](https://github.com/reloopcrm/reloop/issues/120)) ([1294678](https://github.com/reloopcrm/reloop/commit/1294678bbc58fb9e5f195ebe55ac767a2cfeaf30))
* move hosted billing and the marketing site out of the open-source repo ([1294678](https://github.com/reloopcrm/reloop/commit/1294678bbc58fb9e5f195ebe55ac767a2cfeaf30))
* the cloud module carries the tenancy, billing takes a workspace id ([#125](https://github.com/reloopcrm/reloop/issues/125)) ([e6be35b](https://github.com/reloopcrm/reloop/commit/e6be35b34e153d00f988ecb5bc2dd97761fd9921))
* the tenancy leaves the core, every cloud slot is a no-op ([#126](https://github.com/reloopcrm/reloop/issues/126)) ([5e7096a](https://github.com/reloopcrm/reloop/commit/5e7096a7523b19c992a942089bb00673b83b20cd))


### Documentation

* design rules for the new app look ([#161](https://github.com/reloopcrm/reloop/issues/161)) ([cc4baab](https://github.com/reloopcrm/reloop/commit/cc4baab06180a68bfb193a631a3891e6b24177f9))
* **readme:** replace product screenshots with English sample data ([#88](https://github.com/reloopcrm/reloop/issues/88)) ([140d57a](https://github.com/reloopcrm/reloop/commit/140d57a527f13b077c0a8aba47587cb3315f4f99))

## [0.20.0](https://github.com/reloopcrm/reloop/compare/v0.19.0...v0.20.0) (2026-09-23)


### Features

* **agent:** the Autobahn lanes, a shared key bucket per tenant, and import progress for the customer ([#57](https://github.com/reloopcrm/reloop/issues/57)) ([0d33a03](https://github.com/reloopcrm/reloop/commit/0d33a03fac0263aee66821486c90eb9f04b1fe08))
* **app:** usage meters and a plan and billing page for the hosted Cloud, with Stripe ([#64](https://github.com/reloopcrm/reloop/issues/64)) ([16b5c93](https://github.com/reloopcrm/reloop/commit/16b5c9388c2ad1de3df4bc2d5531a2b061c621be))
* **cloud:** sign up and sign in with email, password and a mailed code ([#59](https://github.com/reloopcrm/reloop/issues/59)) ([e1fddd6](https://github.com/reloopcrm/reloop/commit/e1fddd68a922c9bb87d27446b4a0c3a8e606deaa))
* **cloud:** the operator's own workspace as one tenant, and the marketing site served by the cloud ([#67](https://github.com/reloopcrm/reloop/issues/67)) ([7d00410](https://github.com/reloopcrm/reloop/commit/7d00410e7df380ff9fbd7d5ce66146eefdba91cc))
* **landing:** every public page in the landing design, in seven languages ([#65](https://github.com/reloopcrm/reloop/issues/65)) ([4c5f0c7](https://github.com/reloopcrm/reloop/commit/4c5f0c727cc9013f9b1ee6a65b055e82e649592c))


### Fixes

* **api:** the open tenant routes ignore a session cookie from another workspace ([#62](https://github.com/reloopcrm/reloop/issues/62)) ([5f397c8](https://github.com/reloopcrm/reloop/commit/5f397c8f0f22224287497f8c2bc422f2840f1ea7))
* **app:** sample data in the reader's language, onboarding pre-filled, eleven layout fixes ([#63](https://github.com/reloopcrm/reloop/issues/63)) ([3047a45](https://github.com/reloopcrm/reloop/commit/3047a45e0a939bea12ce2ad413a341159f4b67a0))
* **app:** the landing sends Sign in to the cloud when RELOOP_CLOUD_URL is set ([#66](https://github.com/reloopcrm/reloop/issues/66)) ([5deec3b](https://github.com/reloopcrm/reloop/commit/5deec3be5d5c9c073b16ef1e67a81bae82fe1d68))
* **deploy:** the cloud backup copies off-site instead of mirroring, and its image builds ([#58](https://github.com/reloopcrm/reloop/issues/58)) ([feb7548](https://github.com/reloopcrm/reloop/commit/feb75482a11480168e9966e90ba08c54da2f08f6))
* **test:** read AGENT_URL per request, and bucket the compiled fallback model ([#61](https://github.com/reloopcrm/reloop/issues/61)) ([99d8a1c](https://github.com/reloopcrm/reloop/commit/99d8a1cb4ce86c51b8ad3a6133db439ccd3412f4))

## [0.19.0](https://github.com/reloopcrm/reloop/compare/v0.18.1...v0.19.0) (2026-09-22)


### Features

* **api:** the mailbox backfill reads more per tick, and every size is tunable by env ([#54](https://github.com/reloopcrm/reloop/issues/54)) ([dfbc071](https://github.com/reloopcrm/reloop/commit/dfbc071efe09d8a53a5e005043f78929941f6c71))
* **app:** the hosted cloud links marketing pages to the marketing site ([#51](https://github.com/reloopcrm/reloop/issues/51)) ([7f5ede3](https://github.com/reloopcrm/reloop/commit/7f5ede338f5873954d4c04aa6ca2b75d2addf8b6))
* **app:** the marketing site sends sign-ups to the hosted cloud ([#50](https://github.com/reloopcrm/reloop/issues/50)) ([dd785b2](https://github.com/reloopcrm/reloop/commit/dd785b2a6c463e059f00128d3e073081370ecaae))
* **plans:** cap company research runs and builder messages per plan ([#56](https://github.com/reloopcrm/reloop/issues/56)) ([b3c8d23](https://github.com/reloopcrm/reloop/commit/b3c8d230cbc2bce2c7ac1bc7f0ea788cf9e5ab3b))


### Fixes

* **app:** read the workspace role inside the tenant, and guard every app db read ([#53](https://github.com/reloopcrm/reloop/issues/53)) ([38816e6](https://github.com/reloopcrm/reloop/commit/38816e6832dca8c108535c6e0bd2cc8e2bc8323e))
* **app:** the hosted cloud hides or trims the onboarding AI step ([#52](https://github.com/reloopcrm/reloop/issues/52)) ([fbf8a6f](https://github.com/reloopcrm/reloop/commit/fbf8a6f9251c3b3be3c444e1bcf168e323ed69a0))
* **db:** the trial costs little: 500 conversations, 20 drafts, 100 research sessions, 200 chat messages ([#48](https://github.com/reloopcrm/reloop/issues/48)) ([a96fff3](https://github.com/reloopcrm/reloop/commit/a96fff359f42c24bb5be7e113f53e2173dc40a0a))
* **deploy:** the agent container gets TYPESAFE_API_KEY ([#55](https://github.com/reloopcrm/reloop/issues/55)) ([291db98](https://github.com/reloopcrm/reloop/commit/291db9844de3f3b4f71d916cd66445c9cdbf3fc4))

## [0.18.1](https://github.com/reloopcrm/reloop/compare/v0.18.0...v0.18.1) (2026-09-21)


### Fixes

* **app:** the app image builds again, no client component reaches pg or async_hooks ([#46](https://github.com/reloopcrm/reloop/issues/46)) ([dc9729d](https://github.com/reloopcrm/reloop/commit/dc9729d4239bf5692e406ba75b41e6f0646f4264))

## [0.18.0](https://github.com/reloopcrm/reloop/compare/v0.17.0...v0.18.0) (2026-09-21)


### Features

* **agent:** the agent serves every tenant, fixed AI on included plans, plan limits and history retention ([#45](https://github.com/reloopcrm/reloop/issues/45)) ([781465c](https://github.com/reloopcrm/reloop/commit/781465c4365788d418286d1ff5843863d2b5b7bc))
* **api:** hosted multi-tenant foundation behind RELOOP_REGISTRY_URL ([#41](https://github.com/reloopcrm/reloop/issues/41)) ([eabdd5b](https://github.com/reloopcrm/reloop/commit/eabdd5b558a1bf96c40750e340d3b6309a5f3b4a))
* **api:** tenant loops run in parallel with a budget, and the plan and session gaps close ([#43](https://github.com/reloopcrm/reloop/issues/43)) ([7d701f2](https://github.com/reloopcrm/reloop/commit/7d701f22de4ba8b2bfdbf320d3325b680f6d4e76))
* **api:** tenant signup, provisioning, trial expiry, nightly backups and deletion for hosted mode ([#44](https://github.com/reloopcrm/reloop/issues/44)) ([ed5b7e9](https://github.com/reloopcrm/reloop/commit/ed5b7e999f11ef72370508ec26b3403e4395f66a))
* **app:** email-first sign-in, sign-up form and tenant context in hosted mode ([#42](https://github.com/reloopcrm/reloop/issues/42)) ([44f7841](https://github.com/reloopcrm/reloop/commit/44f7841cd386334bfe877b13e3e6d772a3773008))


### Fixes

* **app:** the eve bridge refuses a session without a conversation row owned by the caller ([#39](https://github.com/reloopcrm/reloop/issues/39)) ([05886a1](https://github.com/reloopcrm/reloop/commit/05886a18b17d752f8185511071753d012bd00fd1))
* **db:** plan ids match the pricing page, and the contact trigger knows every plan ([#38](https://github.com/reloopcrm/reloop/issues/38)) ([7af931c](https://github.com/reloopcrm/reloop/commit/7af931cbf30e1ca462e23145a8dc903f2ab789a2))

## [0.17.0](https://github.com/reloopcrm/reloop/compare/v0.16.0...v0.17.0) (2026-09-21)


### Features

* **landing:** a pricing page, and every page now sells the trial ([#34](https://github.com/reloopcrm/reloop/issues/34)) ([4adac97](https://github.com/reloopcrm/reloop/commit/4adac97b99a8552a3b97655277b80b9feb31f232))


### Fixes

* **agent:** start the built server directly, not through eve start ([#36](https://github.com/reloopcrm/reloop/issues/36)) ([bad0787](https://github.com/reloopcrm/reloop/commit/bad0787ca28b4e274a324d2b14b66cdb73cf4af9))
* **ci:** pin the auth tests to one API origin, and let the owner skip the CLA ([#35](https://github.com/reloopcrm/reloop/issues/35)) ([d14ed5d](https://github.com/reloopcrm/reloop/commit/d14ed5d967afd57d89ac97e16eb9f6aaf716fa6c))

## [0.16.0](https://github.com/reloopcrm/reloop/compare/v0.15.1...v0.16.0) (2026-09-21)


### Features

* **connections:** set Google, Microsoft and Slack from the web ([#28](https://github.com/reloopcrm/reloop/issues/28)) ([d9c2664](https://github.com/reloopcrm/reloop/commit/d9c2664f5f411ef333f7025664ac55c4d90a43a2))
* **landing:** a louder start page that leads with winning customers back ([#30](https://github.com/reloopcrm/reloop/issues/30)) ([acc7ad5](https://github.com/reloopcrm/reloop/commit/acc7ad583830f5650d7380ad373308701291dfb3))


### Fixes

* **deploy:** leave the agent's memory alone unless a host asks ([#29](https://github.com/reloopcrm/reloop/issues/29)) ([8bc439c](https://github.com/reloopcrm/reloop/commit/8bc439c98905e38c6d8903d7b7a8705be777b48c))
* **deploy:** let the updater speak a Docker API the engine accepts ([#31](https://github.com/reloopcrm/reloop/issues/31)) ([5fb0132](https://github.com/reloopcrm/reloop/commit/5fb0132fbffeb739d9e69c2259b8316609b5d430))

## [0.15.1](https://github.com/reloopcrm/reloop/compare/v0.15.0...v0.15.1) (2026-09-20)


### Fixes

* **release:** publish three images or none, and cap what the agent holds ([#25](https://github.com/reloopcrm/reloop/issues/25)) ([0dfc90b](https://github.com/reloopcrm/reloop/commit/0dfc90b72b7c77b7ccb2dde96bfde76e5b3d7a89))

## [0.15.0](https://github.com/reloopcrm/reloop/compare/v0.14.0...v0.15.0) (2026-09-20)


### Features

* one page for the AI, and three more cheap gates ([#23](https://github.com/reloopcrm/reloop/issues/23)) ([d4ca95d](https://github.com/reloopcrm/reloop/commit/d4ca95d4d4b93d06d6e55ced10529958ea5ec90e))

## [0.14.0](https://github.com/reloopcrm/reloop/compare/v0.13.0...v0.14.0) (2026-09-20)


### Features

* **agent:** keep reading mail when the model window is empty ([#22](https://github.com/reloopcrm/reloop/issues/22)) ([45622a7](https://github.com/reloopcrm/reloop/commit/45622a78e659d7bc87892b93f6e47c0ad3fe810d))


### Fixes

* **timeline:** read a thread newest first, like the list around it ([#20](https://github.com/reloopcrm/reloop/issues/20)) ([1147955](https://github.com/reloopcrm/reloop/commit/1147955c417fd34ef5e6ebb7054bfe0c8562d24a))

## [0.13.0](https://github.com/reloopcrm/reloop/compare/v0.12.1...v0.13.0) (2026-09-20)


### Features

* **agent:** read a mail conversation cheaply before paying for the full read ([#18](https://github.com/reloopcrm/reloop/issues/18)) ([17eea87](https://github.com/reloopcrm/reloop/commit/17eea870482a80c3c5af47321186bd917cafa917))

## [0.12.1](https://github.com/reloopcrm/reloop/compare/v0.12.0...v0.12.1) (2026-09-19)


### Fixes

* **timeline:** scroll the activity tab as one page ([#16](https://github.com/reloopcrm/reloop/issues/16)) ([8c3c80b](https://github.com/reloopcrm/reloop/commit/8c3c80bc764f5a5e4e4e9c0595913b3602532d97))

## [0.12.0](https://github.com/reloopcrm/reloop/compare/v0.11.0...v0.12.0) (2026-09-19)


### Features

* **contacts:** say what to do about this person ([c483c90](https://github.com/reloopcrm/reloop/commit/c483c90b92ee47a3378529703ddb17bad96f2cf2))
* tasks on the start page, editable notes, quiet deals, remind later ([047f3ee](https://github.com/reloopcrm/reloop/commit/047f3ee2b223cfe1371272184209250b96b3f6d9))


### Fixes

* close what the feature round left open ([ca9e1df](https://github.com/reloopcrm/reloop/commit/ca9e1dfbeae6e9cec72f0ff411dfce212de59add))
* **contacts:** answer honestly and open the mail a quote came from ([d6e3c0c](https://github.com/reloopcrm/reloop/commit/d6e3c0c50ee8ed25cb665e65d0a546054b4acd85))
* **security:** close what the second audit found ([ad98208](https://github.com/reloopcrm/reloop/commit/ad9820885c222fd7315291f07fd0d2901fbedf83))
* **timeline:** collapse one mail thread into one row ([77e7ec8](https://github.com/reloopcrm/reloop/commit/77e7ec8c946b591c3f8cb23c4e353cd1c816a857))
* **timeline:** keep each day strip inside its own day ([3304020](https://github.com/reloopcrm/reloop/commit/33040201b409e6cf0428c0b5b79c030d61f4e1f9))

## [0.11.0](https://github.com/reloopcrm/reloop/compare/v0.10.0...v0.11.0) (2026-09-18)


### Features

* **connections:** send CRM events to a webhook ([fc9c372](https://github.com/reloopcrm/reloop/commit/fc9c3724bf4dbb32a82fbc4b73d48805f940e895))
* **deals:** turn the quotes in your mail into deals ([5aff4ad](https://github.com/reloopcrm/reloop/commit/5aff4ad640b3e18cf2fa3ea80edbda4aefa89f28))
* **demo:** load sample data into an empty install ([ce106dd](https://github.com/reloopcrm/reloop/commit/ce106ddd8754b7601a84425f6f48b7fabcc2dde1))
* **i18n:** speak seven languages, picked in settings ([261a9c4](https://github.com/reloopcrm/reloop/commit/261a9c44e130c0cabea8e7abee178e5278198f11))
* **timeline:** one line per event, opened on demand ([69b0c10](https://github.com/reloopcrm/reloop/commit/69b0c1026fb90766197d24fa28a34454de706487))


### Fixes

* **demo:** keep the agent away from sample records ([ebcfe8c](https://github.com/reloopcrm/reloop/commit/ebcfe8c0b86612ef37190063dad7cdfd95caca0e))

## [0.10.0](https://github.com/reloopcrm/reloop/compare/v0.9.0...v0.10.0) (2026-09-18)


### Features

* **agent:** take the Context integration out ([37d87dc](https://github.com/reloopcrm/reloop/commit/37d87dc12b09d36a6e7e1b977248ac245c7ca98a))
* **api:** make the REST API reachable and documented ([7dcb41e](https://github.com/reloopcrm/reloop/commit/7dcb41e706291ac656d6a4ba6ffcb6175ece07d1))
* **app:** send the first run to a mailbox ([0130a9e](https://github.com/reloopcrm/reloop/commit/0130a9e97b52a0b46db7f4ae60524d9133f305f9))
* **app:** tell the owner that an update is out ([f411dd7](https://github.com/reloopcrm/reloop/commit/f411dd7f5f6eff2599a98b5db14655c480174f5e))
* **mailbox:** read the Gmail and Outlook history backwards ([d448089](https://github.com/reloopcrm/reloop/commit/d4480894cf76d69971638b6b1675c230f563068f))
* **records:** export a list as CSV ([3829f79](https://github.com/reloopcrm/reloop/commit/3829f79b68563712e1599964468062cfcd1119fc))
* **settings:** add a colleague without a shell ([3889eaf](https://github.com/reloopcrm/reloop/commit/3889eaf048f6584fd796eddc8d934dab41201726))


### Fixes

* **records:** write the CSV in the reader's language ([a81ae5f](https://github.com/reloopcrm/reloop/commit/a81ae5fbff42077fedae4dc851afc11dca746b69))
* **records:** write the stored values in the reader's language ([5101d0d](https://github.com/reloopcrm/reloop/commit/5101d0dac04ef78c8de3ef008abd751575d94333))


### Documentation

* say that a stored enum value is translated ([b1ea313](https://github.com/reloopcrm/reloop/commit/b1ea313592e8e8980419dfe96392bdc004e269c1))

## [0.9.0](https://github.com/reloopcrm/reloop/compare/v0.8.0...v0.9.0) (2026-09-17)


### Features

* **deploy:** update a source install by itself ([fe24caf](https://github.com/reloopcrm/reloop/commit/fe24caf64c6b3d2020aa87e03114fd2109700a48))
* **settings:** show the waitlist to the cloud owner only ([78bfb74](https://github.com/reloopcrm/reloop/commit/78bfb7448175ad94dabbf6c2ad4aea394ffdd161))


### Fixes

* **agent:** ledger the phone number from a signature ([d0c6d6f](https://github.com/reloopcrm/reloop/commit/d0c6d6f8f349d88cd1aaa690f473558a1738679a))
* **agent:** only a source that identifies the person writes a name ([e3bafed](https://github.com/reloopcrm/reloop/commit/e3bafedf292aa1240dc859866e495bb83d194f42))
* **agent:** seal the Slack user token and survive a lost key ([08bb1f4](https://github.com/reloopcrm/reloop/commit/08bb1f403bb845d26ab186cd24762772108db9af))
* **agent:** take the real name from the signature, not the address ([035c679](https://github.com/reloopcrm/reloop/commit/035c679e06cfd4e4f20d11dc2b51bfde7f69567c))
* **agent:** take the shell away and mark mail text as data ([059a699](https://github.com/reloopcrm/reloop/commit/059a699e507ae46b96a890fbe0162bdf025d31ed))
* **auth:** seal the OAuth tokens in the database ([6407230](https://github.com/reloopcrm/reloop/commit/64072306d46110509a5333ec37320988fa1260b5))
* **deploy:** give the api its marketing flag ([96ed303](https://github.com/reloopcrm/reloop/commit/96ed30313cf9b8ecaad4c1eb281b3aadaddae961))
* **security:** limit sign-in tries, request size and who may change a role ([3440692](https://github.com/reloopcrm/reloop/commit/34406926c4566766d548394919e87bfacbee2f8e))
* **setup:** recover the owner account and name the missing model provider ([1cad18c](https://github.com/reloopcrm/reloop/commit/1cad18c87e2b3a7114f7fce266b9bf95febfaa7c))
* **tasks:** treat a due date as a calendar day ([2d1e40a](https://github.com/reloopcrm/reloop/commit/2d1e40ae2518aa266ba717ae38bacb38741c8a48))


### Documentation

* say which mailbox really brings its history ([2f22860](https://github.com/reloopcrm/reloop/commit/2f228600b8144e7efbe8e54314d5bfa6d90ee6d3))

## [0.8.0](https://github.com/reloopcrm/reloop/compare/v0.7.1...v0.8.0) (2026-09-17)


### Features

* **docs:** give every part of the guide its own page ([5f74adf](https://github.com/reloopcrm/reloop/commit/5f74adf67d883768e68409d6252a138663ae0608))
* **nav:** mark settings when an update waits ([ced4fcb](https://github.com/reloopcrm/reloop/commit/ced4fcb7223b2db090869146f53dc34a6f0aa85d))
* **seo:** let search engines read the site ([20fe6cd](https://github.com/reloopcrm/reloop/commit/20fe6cdb1c2074da3808a8b55ec987936004e833))
* **settings:** update the install from the app ([5b8263c](https://github.com/reloopcrm/reloop/commit/5b8263cbfcec1caa097ee41c2a45d73fce1ef6d3))
* **site:** answer the searches people actually type ([6f2b136](https://github.com/reloopcrm/reloop/commit/6f2b1360efa72fdbf37de28a69df7da86e801280))
* **site:** split the footer and allow the google tag ([9d227af](https://github.com/reloopcrm/reloop/commit/9d227af53fe8eb13d2dc7ea27ffe0b97f5506f0b))


### Fixes

* **build:** pass the google token to the dev task too ([9353c0d](https://github.com/reloopcrm/reloop/commit/9353c0d5f8b3427f38bd89a9924ef8c7a004a274))
* **site:** keep the marketing pages on the public install ([6a9315e](https://github.com/reloopcrm/reloop/commit/6a9315ea166a19427474ee22b7a305c8c5c1a5e2))

## [0.7.1](https://github.com/reloopcrm/reloop/compare/v0.7.0...v0.7.1) (2026-09-17)


### Fixes

* **settings:** take the cloud waitlist out of the app ([855e6ab](https://github.com/reloopcrm/reloop/commit/855e6ab0f932c5540aa5999e4e2c9cd18e5a385c))


### Documentation

* link the site from the top of the readme ([5822982](https://github.com/reloopcrm/reloop/commit/582298284b2c0e019a0924719b8785fe846c97fd))
* show the product in the readme ([c99c1d6](https://github.com/reloopcrm/reloop/commit/c99c1d606da73b05e0bd0dcafd621fb1a027f68d))

## [0.7.0](https://github.com/reloopcrm/reloop/compare/v0.6.0...v0.7.0) (2026-09-17)


### Features

* **agent:** pay the model through openrouter ([aa41aa4](https://github.com/reloopcrm/reloop/commit/aa41aa45949611ff112ffece0405b92b7332a911))

## [0.6.0](https://github.com/reloopcrm/reloop/compare/v0.5.0...v0.6.0) (2026-09-16)


### Features

* **demo:** give the first win-back person a full history ([d7d25e9](https://github.com/reloopcrm/reloop/commit/d7d25e9745b9ba4f41e05039228f5fb705f28a2c))
* **timeline:** read the history as a conversation ([b4b746d](https://github.com/reloopcrm/reloop/commit/b4b746dfb8862dd5a892591d50dd9ffac4657a87))


### Fixes

* **demo:** keep every job title in english ([da9a012](https://github.com/reloopcrm/reloop/commit/da9a012338c5040dbca5d6dfe1f0bb418403212b))

## [0.5.0](https://github.com/reloopcrm/reloop/compare/v0.4.1...v0.5.0) (2026-09-16)


### Features

* **demo:** let the app show itself ([91990c1](https://github.com/reloopcrm/reloop/commit/91990c16f5291ac82108f9d28d561e52bd30b27d))
* **demo:** seed a believable workspace for screenshots ([653fd39](https://github.com/reloopcrm/reloop/commit/653fd39da8bec12a9da657df43393493ef278b7b))

## [0.4.1](https://github.com/reloopcrm/reloop/compare/v0.4.0...v0.4.1) (2026-09-16)


### Fixes

* **connections:** drop the two entries nobody can use ([6770a8a](https://github.com/reloopcrm/reloop/commit/6770a8adb81e1552d9ca63e7633cfce23cde8c60))
* **nav:** keep the rail narrow and put the names in tooltips ([9ba2323](https://github.com/reloopcrm/reloop/commit/9ba232343a837643f003304dc191b5863c0c6146))
* **settings:** keep the plan card for the operator only ([01e52c5](https://github.com/reloopcrm/reloop/commit/01e52c51e85b55d520462ace38e4a0dbfa5168b2))


### Performance

* **docker:** drop the sandbox the container never uses ([3321e22](https://github.com/reloopcrm/reloop/commit/3321e229d64bb514faf10bbb16204ec636d50267))

## [0.4.0](https://github.com/reloopcrm/reloop/compare/v0.3.0...v0.4.0) (2026-09-16)


### Features

* **nav:** open the rail on hover and group its entries ([f9a37b1](https://github.com/reloopcrm/reloop/commit/f9a37b1298c3bbce2b362a63bb7c443b1b2989cf))
* **settings:** let the version card check again on demand ([cec8c82](https://github.com/reloopcrm/reloop/commit/cec8c82cd82eaaed0828e1d2ac2c0c0cd03536c1))
* **site:** give shared links a real preview ([5bae945](https://github.com/reloopcrm/reloop/commit/5bae945761b7a10d3fa705a097a7fa9260f0f3e8))
* **ui:** drop the old mark from every loading state ([2c0b0c2](https://github.com/reloopcrm/reloop/commit/2c0b0c24ce34abaf9bf710da8719d92b0726c903))
* **ui:** load with the reloop wordmark ([86b3353](https://github.com/reloopcrm/reloop/commit/86b335386aa640a0b762968ab580fbe699b82b31))
* **ui:** show the wordmark wherever a section loads ([0b5b628](https://github.com/reloopcrm/reloop/commit/0b5b6284e0210d1532cc3fc972989f633cf6a2e5))


### Fixes

* **nav:** give chat the same icon size as its neighbours ([1c48483](https://github.com/reloopcrm/reloop/commit/1c484830fa10be3ed3a4a83d5f1c20e8189abcf2))
* **nav:** open the rail on hover for real ([d19b4f4](https://github.com/reloopcrm/reloop/commit/d19b4f442cf16f118e2b889a0b958042dc1d5b1b))
* **site:** let link previews read the share image ([0c3e3d4](https://github.com/reloopcrm/reloop/commit/0c3e3d4e87975afc0ba8f421c322a652ef912c17))

## [0.3.0](https://github.com/reloopcrm/reloop/compare/v0.2.0...v0.3.0) (2026-09-16)


### Features

* **agent:** fetch codex on first use ([1e916ec](https://github.com/reloopcrm/reloop/commit/1e916ec99069ce6cadc246a064520a16da3f19ca))
* **settings:** show the version and the update command ([8ae90cd](https://github.com/reloopcrm/reloop/commit/8ae90cd45181a06e286441f43af58adf80b30bee))


### Fixes

* **landing:** line the two get-started cards up row by row ([5fa59b8](https://github.com/reloopcrm/reloop/commit/5fa59b89c7c58ae1f9250e5e823482ab9ed45cb7))

## [0.2.0](https://github.com/reloopcrm/reloop/compare/v0.1.0...v0.2.0) (2026-09-16)


### Features

* **install:** accept the answers as variables ([91a3615](https://github.com/reloopcrm/reloop/commit/91a3615bc7aef8294100bf83390be828d6e90e42))
* **install:** set Docker up when it is missing ([b0fa2c0](https://github.com/reloopcrm/reloop/commit/b0fa2c05dabcb2f68bbd46066137790eeb935bea))
* **settings:** give every provider its own dialog ([b3dce09](https://github.com/reloopcrm/reloop/commit/b3dce09aae29f29539d8e236ae43dadc3f957594))
* **timeline:** name the real mail source ([ff3a62d](https://github.com/reloopcrm/reloop/commit/ff3a62d0e5a59702fe5822848ab62bc05fcfe4e8))
* **timeline:** show who wrote each activity ([8730dc4](https://github.com/reloopcrm/reloop/commit/8730dc4b652e33344edceb557e3f6d3ede6cd94f))


### Fixes

* **auth:** keep the session cookie readable on http installs ([34e2cdd](https://github.com/reloopcrm/reloop/commit/34e2cddd2b1be6925595f4d772cd8d0d0db04d92))
* **install:** name the folder fix in the volume error ([4293ed2](https://github.com/reloopcrm/reloop/commit/4293ed25a2184a1a2174877c9ce2fef91f871af2))
* **landing:** stack the cloud email field and its button ([fbe255c](https://github.com/reloopcrm/reloop/commit/fbe255c927f44be9b64421e9090acbe298921b13))
* **settings:** show each provider inside the card, no dialogs ([e0141b8](https://github.com/reloopcrm/reloop/commit/e0141b8837d6e02aa5a0c1900aa5d3e307c5fabe))


### Performance

* **docker:** ship only what runs in each image ([2630270](https://github.com/reloopcrm/reloop/commit/26302704afeb94477fbae2063c88b4f3bd4f6d33))

## 0.1.0 (2026-09-16)


### Features

* Reloop CRM, open source and self-hostable ([16a6b84](https://github.com/reloopcrm/reloop/commit/16a6b847f00bf7ba7131c388d84b2f2495c242c0))
* **settings:** switch every AI function on or off ([046093c](https://github.com/reloopcrm/reloop/commit/046093cd1f0a71ed0c15d4900a7b40c07b099451))
* **waitlist:** store the address without a confirmation email ([34d98c6](https://github.com/reloopcrm/reloop/commit/34d98c6269cc4d41bc22fc5b79b419f9ba74644a))


### Fixes

* **agent:** let the business setup prompt build its JSON schema ([8f0e495](https://github.com/reloopcrm/reloop/commit/8f0e4958cc28855eab8bc6c649cb9e7542b7107c))
* **deploy:** build the agent image and install from local images ([7361673](https://github.com/reloopcrm/reloop/commit/73616739e2ba5d5ab9481e36586a83e30bc3872c))
* **landing:** start the footer logo at the left edge ([188aabe](https://github.com/reloopcrm/reloop/commit/188aabeb1edeb2b196eceda91df712f00896ff78))
* **records:** put activity before deals in the record tabs ([f08808c](https://github.com/reloopcrm/reloop/commit/f08808ca50c716ee19354ed0b1a01bb514fc9619))
* **settings:** make the agent card small and plain ([734d757](https://github.com/reloopcrm/reloop/commit/734d75742971615f0dedfb789c55d63771a031bf))
* **settings:** show the current language in the picker ([2540bcd](https://github.com/reloopcrm/reloop/commit/2540bcdbd1845929ce1efc5d508cb36c2b2aa7f2))
* **tracking:** find the tag in the page's own scripts ([6d8e201](https://github.com/reloopcrm/reloop/commit/6d8e201af1ec9d336e17ad562d9c1f237f2518a1))
* **ui:** keep the wordmark at its own width ([97a18e4](https://github.com/reloopcrm/reloop/commit/97a18e48d7b2f09ab12f2a72b48da5831239e7ec))


### Documentation

* show the logo at the top of the README ([8b02f2b](https://github.com/reloopcrm/reloop/commit/8b02f2b02db62da484ec29fbc064bcaa5d5beb22))
* use the Reloop mark in the README ([d0f8f5c](https://github.com/reloopcrm/reloop/commit/d0f8f5cd45bc62f01d3198a3e9d894da97d5cb48))

## Changelog
