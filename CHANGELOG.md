# Changelog

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
