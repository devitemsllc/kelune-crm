=== Kelune CRM – Contact Management, Email Marketing, Newsletter & Marketing Automation ===
Contributors: devitemsllc, nazmulhudadev, aslamhasib
Tags: crm, contacts, email marketing, marketing automation, email campaigns
Requires at least: 6.6
Tested up to: 7.1
Stable tag: 1.0.1
Requires PHP: 8.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A complete WordPress CRM: manage contacts, send email campaigns, and automate follow-ups with a visual builder. Self-hosted and free.

== Description ==

= Complete WordPress CRM with Contact Management, Email Campaigns, Newsletters, Visual Marketing Automation, and Reports =

Kelune CRM is a self-hosted CRM and marketing platform for WordPress. Manage your contacts, organize them with tags and lists, design emails with a drag-and-drop builder, run campaigns, and automate follow-ups with a visual automation builder — all from your WordPress admin.

Every feature in the Free Features list below is included and fully functional. Kelune CRM stores your data in your own WordPress database and works offline by default: aside from the avatar WordPress itself already loads for the logged-in user, it only contacts an external service when you explicitly enable and configure one (see the "External services" section below).

== 👇 Helpful Links to Get Started ==

🔎 [Learn More](https://kelunecrm.com?utm_source=wprepo&utm_medium=freeplugin&utm_campaign=learnmore) | 🚀 [Explore Pro](https://kelunecrm.com/pricing?utm_source=wprepo&utm_medium=freeplugin&utm_campaign=purchasepro)

== ❤️ Free Features ==

* **Contacts** — full CRUD, activity timeline, custom meta, and notes.
* **Tags & Lists** — organize contacts and drive audience selection.
* **Custom Fields** — single-line and multi-line text, number, email, URL, phone, select, radio, checkbox, date, and datetime.
* **Email Templates** — drag-and-drop builder with automatic CSS inlining.
* **Email Providers** — send via SMTP, Amazon SES, Mailgun, or SendGrid, or the default WordPress mailer.
* **Email Logs** — open/click tracking, stats, and CSV export.
* **Campaigns** — scheduler, sending queue, and open/click tracking.
* **Visual Automation** — trigger, delay, and action steps on a flow canvas.
* **Incoming Webhooks** — create/update contacts and manage tags/lists from external systems.
* **Double Opt-in** — confirmation flow and per-contact subscription status.
* **Contact Import** — bring your audience in from CSV or Excel (.xlsx, .xls) files.
* **Settings** — business identity, global email and footer, WordPress user sync, signup/comment opt-in, and email-provider configuration.

== 🔥 Pro Features (Kelune CRM Pro) ==

Kelune CRM Pro is an add-on that installs alongside this plugin and unlocks the advanced audience, tracking and automation tools:

**🎯 Dynamic Segments**

* Visual query builder with AND/OR logic and nested condition groups.
* Segment on contact fields, custom fields, tags, lists, lead score, activity and signup date.
* Membership refreshes automatically, so an audience is always current when you send to it.
* Use a segment as a campaign audience or inside an automation condition.

**🔗 Smart Links**

* Trackable links that act on the contact who clicks them.
* Add or remove tags and lists on click, then redirect to any destination URL.
* Optional expiry date, plus per-link click tracking and reporting.

**🪄 Advanced Automation**

* Condition steps with YES/NO branching on the canvas.
* Branch on field values (10 operators), tags, lists, segments, and email opens or clicks.
* Advanced actions: update a contact field, or send an outgoing webhook to any service.
* Advanced triggers: start a workflow when a contact opens an email or clicks a link.

**⚖️ Campaign A/B Testing**

* Test subject lines or full email content as variants in a single campaign.
* Send to a sample of the audience first, at the percentage you choose.
* The winner is picked automatically by open rate or click rate, then delivered to everyone else.

**⬆️ Automatic Updates**

* One-click updates for the Pro add-on straight from your WordPress dashboard.

👉 **Explore the full power!** [Upgrade to Kelune CRM Pro](https://kelunecrm.com/pricing?utm_source=wprepo&utm_medium=freeplugin&utm_campaign=purchasepro).

== Installation ==

1. In your WordPress admin, go to **Plugins → Add New**, search for "Kelune CRM", and click **Install Now**, then **Activate**. To install manually instead, upload the `kelune-crm` folder to `/wp-content/plugins/` and activate it from the **Plugins** screen.
2. Open **Kelune CRM** from the admin menu to configure your settings and add your first contacts.

== Source Code ==

The admin dashboard is built with React and TypeScript (Vite). The only compiled files in this plugin are its bundle, in `assets/apps/dashboard/`. Everything else is plain, human-readable PHP and CSS.

The full, unminified source of that bundle is published in a [public GitHub repository](https://github.com/devitemsllc/kelune-crm), together with the build configuration (`js-apps/dashboard/vite.config.js`), the dependency manifest (`js-apps/dashboard/package.json`) and the lock file that pins every installed version (`js-apps/dashboard/yarn.lock`).

To rebuild the bundle from that source (requires Node.js 20 or newer):

1. `cd js-apps/dashboard`
2. `yarn install`
3. `yarn build`

Build filenames embed a content hash, so the build is reproducible: the same sources always produce the same filenames. The build also writes `assets/apps/dashboard/manifest.php`, a generated array naming the entry script and stylesheet, which the plugin reads to enqueue them. Those two are registered through `wp_enqueue_script()` and `wp_enqueue_style()`; the remaining chunks under `assets/apps/dashboard/js/` and `assets/apps/dashboard/css/` are loaded from this plugin's own directory as ES module imports. No part of the bundle is fetched from a remote server at runtime.

The build does not modify any third-party code, and no code is obfuscated.

The rich-text editor uses WordPress core's own bundled TinyMCE from `wp-includes/js/tinymce/`, enqueued through core's `wp-tinymce` script handle; no TinyMCE library code is included in this plugin. No other files in this plugin are compiled, minified, or obfuscated.

== Bundled Libraries ==

The files in `assets/apps/dashboard/` are produced by the build described above from the third-party packages listed below. Each is compiled into the shipped scripts — none is fetched at runtime.

* React and ReactDOM (`react`, `react-dom`) — MIT.
* Ant Design (`antd`) — MIT; only the locale pack matching your site language is loaded.
* React Router (`react-router-dom`) — MIT.
* Ant Design Icons (`@ant-design/icons`) and Ant Design Charts with AntV G2 (`@ant-design/charts`) — MIT.
* Redux Toolkit and React Redux (`@reduxjs/toolkit`, `react-redux`) — MIT.
* React Flow (`reactflow`), used by the automation canvas — MIT.
* dnd kit (`@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`), used by the email builder — MIT.
* CodeMirror (`@uiw/react-codemirror`, `@codemirror/lang-html`), used by the HTML editor — MIT.
* juice (`juice`), which inlines CSS into email HTML — MIT.
* Axios (`axios`) — MIT, Day.js (`dayjs`) — MIT, and react-responsive (`react-responsive`) — MIT.
* SheetJS (`xlsx`), used to read spreadsheet files during contact import — Apache License 2.0.

Every package above is MIT licensed except SheetJS, which is Apache 2.0; the dependencies they pull in are MIT, ISC, BSD or 0BSD. All of those are compatible with this plugin's "GPLv2 or later" license. `js-apps/dashboard/package.json` declares the packages depended on directly, and `js-apps/dashboard/yarn.lock` pins the exact version installed for every package, including indirect ones such as AntV G2, html2canvas and Lodash; both files are published in the repository linked above.

No third-party PHP libraries are included: the plugin's own classes load through the hand-written `autoload.php` at the plugin root, and the scoped-vendor directory `libs/third-party/packages/` holds no packages.

== Frequently Asked Questions ==

= What PHP version is required? =

PHP 8.1 or higher.

= Does the plugin require any paid or external service to work? =

No. Kelune CRM is fully functional on its own and works offline by default. External services (email providers, Gravatar for contact avatars) are optional and are only contacted after you enable and configure them. The one exception is the logged-in user's own avatar in the dashboard greeting, which WordPress loads through its standard avatar system. See the "External services" section.

= Which email providers are supported? =

SMTP, Amazon SES, Mailgun, and SendGrid are built in. You can choose which one each campaign sends from.

You can also set up nothing at all. Kelune CRM then hands email to WordPress, so it goes out the same way the rest of your site's mail does — including through any SMTP plugin you already use. Anything that plugin can send through works here too.

= Where is my contact data stored? =

In your own WordPress database, in custom `kelune_crm_*` tables. Nothing is sent anywhere unless you enable an external service.

= Is any functionality locked behind a license? =

No. Everything shipped in this plugin is free and fully functional. The Pro features listed in the description come from a separate add-on plugin, Kelune CRM Pro, which is not required for this plugin to work.

== External services ==

Kelune CRM works fully offline by default and stores all data in your own WordPress database. It connects to an external service only when you explicitly enable and configure that service, with one exception noted under Gravatar below. No data is ever sent to the plugin author.

**SendGrid**

Used to deliver email (campaigns, automations, and transactional mail) when you select SendGrid as your email provider and enter a SendGrid API key.

* Data sent: message content, subject, and recipient/sender email addresses. When you save the provider settings, only your API key is sent, to validate it against the SendGrid profile endpoint.
* When sent: each time the plugin sends an email through this provider, and when you save the provider settings.
* Service URL: https://api.sendgrid.com
* Terms of Service: https://www.twilio.com/en-us/legal/tos/
* Privacy Policy: https://www.twilio.com/en-us/legal/privacy/

**Mailgun**

Used to deliver email (campaigns, automations, and transactional mail) when you select Mailgun as your email provider and enter a Mailgun API key and sending domain.

* Data sent: message content, subject, and recipient/sender email addresses. When you save the provider settings, only your API key and sending domain are sent, to confirm the domain exists on your account.
* When sent: each time the plugin sends an email through this provider, and when you save the provider settings.
* Service URL: https://api.mailgun.net (or https://api.eu.mailgun.net if you select the EU region).
* Terms of Service: https://www.mailgun.com/legal/terms/
* Privacy Policy: https://www.mailgun.com/legal/privacy-policy/

**Amazon SES**

Used to deliver email (campaigns, automations, and transactional mail) when you select Amazon SES as your email provider and enter AWS credentials. No request is made to Amazon until you have selected SES and saved your credentials.

* Data sent: the raw message — recipient/sender addresses, subject, and content. Further calls send only your AWS credentials and no contact data: they read your account's sending quota and list the sender addresses your AWS account has verified.
* When sent: each time the plugin sends an email through this provider; when you save the provider settings; and when you open the provider's details screen.
* Service URL: https://email.{your-region}.amazonaws.com — for example https://email.us-east-1.amazonaws.com
* Terms of Service: https://aws.amazon.com/service-terms/
* Privacy Policy: https://aws.amazon.com/privacy/

**Gravatar**

Used to display contact avatars when you enable the "Use Gravatar service" setting. Separately, and regardless of that setting, the dashboard greeting shows the logged-in WordPress user's own avatar through WordPress's built-in avatar system, which uses Gravatar by default; this is the same avatar WordPress already shows in the admin bar, and it follows the site-wide "Show Avatars" option under Settings > Discussion.

* Data sent: a SHA-256 hash of the email address, sent by the browser when the avatar image is loaded. With the setting disabled, no avatar URL is generated for contacts and nothing is sent.
* When sent: when a contact avatar is rendered with the setting enabled, and when the dashboard greeting renders the logged-in user's avatar.
* Service URL: https://www.gravatar.com
* Terms of Service: https://wordpress.com/tos/
* Privacy Policy: https://automattic.com/privacy/

**SMTP (your own mail server)**

Used to deliver email when you select SMTP as your email provider. This is not a fixed third-party service: the plugin connects only to the mail server host you enter yourself.

* Data sent: message content, subject, and recipient/sender email addresses, plus the SMTP credentials you configure.
* When sent: each time the plugin sends an email through this provider.
* Service URL: the SMTP host you configure.
* Terms & Privacy: governed by your own mail server provider.

== Screenshots ==

1. Dashboard — contacts, campaigns, emails sent and active automations, with a 30-day growth curve and your delivery, open and click totals.
2. Contacts — search, filter and sort your whole contact base, with lists, tags and subscription status on every row.
3. Automations — build a follow-up sequence on a canvas from triggers, delays and actions, then switch it on.
4. Campaigns — drafts, scheduled sends and finished campaigns in one list, with recipients, open rate and click rate.
5. Email builder — design an email by dragging in text, image, button, divider, spacer, column and HTML blocks.
6. Contact profile — details and custom fields, activity timeline, private notes, and every email that contact was sent.
7. Email logs — every message logged with its type, status, provider and engagement, filterable and exportable to CSV.
8. Analytics — contact growth and email engagement over any date range, plus per-campaign performance.
9. Lists and tags — group the audiences you send to and record what each contact did.
10. Email providers — send through SMTP, Amazon SES, Mailgun or SendGrid, and pick the sender per campaign.

== Changelog ==

= Version: 1.0.1 - Date: 20 August, 2026 =
* Added: Optional label for automation steps, shown on the automation canvas.
* Added: Contact import accepts Excel files (.xlsx, .xls) alongside CSV.
* Improved: Overall plugin performance and stability for smoother, more reliable usage.
* Fixed: Minor bugs and issues to enhance functionality and user experience.
* Tested: Compatibility with the latest version of WordPress.

= Version: 1.0.0 - Date: 17 August, 2026 =
* Initial release.

== Upgrade Notice ==

= 1.0.1 =
Adds automation step labels and contact import from Excel files (.xlsx, .xls), and is tested with the latest WordPress. The database updates automatically on the first admin page load after upgrading.

= 1.0.0 =
Initial release.
