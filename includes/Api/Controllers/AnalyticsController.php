<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Repositories\AutomationRepository;
use KeluneCRM\Repositories\CampaignRepository;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Repositories\EmailLogRepository;
use KeluneCRM\Repositories\EmailTemplateRepository;
use KeluneCRM\Repositories\TagRepository;
use KeluneCRM\Support\DateBucketer;

class AnalyticsController extends BaseController
{
    protected string $restBase = 'analytics';

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        $routes = [
            'home' => 'getHome',
            'dashboard' => 'getDashboard',
            'contacts-growth' => 'getContactsGrowth',
            'email-stats' => 'getEmailStats',
            'campaign-performance' => 'getCampaignPerformance',
        ];

        foreach ($routes as $path => $callback) {
            register_rest_route($namespace, '/' . $this->restBase . '/' . $path, [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, $callback],
                'permission_callback' => [$this, 'checkReadPermission'],
            ]);
        }
    }

    /**
     * Landing dashboard: KPI stats + recent contacts/campaigns/automations +
     * getting-started checklist flags.
     */
    public function getHome(\WP_REST_Request $request): \WP_REST_Response
    {
        $contacts = new ContactRepository();
        $campaigns = new CampaignRepository();
        $automations = new AutomationRepository();
        $tags = new TagRepository();
        $templates = new EmailTemplateRepository();

        $avatarService = new \KeluneCRM\Services\AvatarService();

        $recentContacts = array_map(
            static function ($contact) use ($avatarService): array {
                $data = $contact->toArray();

                return [
                    'id' => (int) ($data['id'] ?? 0),
                    'first_name' => (string) ($data['first_name'] ?? ''),
                    'last_name' => (string) ($data['last_name'] ?? ''),
                    'email' => (string) ($data['email'] ?? ''),
                    'status' => (string) ($data['status'] ?? ''),
                    'created_at' => (string) ($data['created_at'] ?? ''),
                    // Same resolution as ContactsController::getItems().
                    'avatar_url' => $avatarService->forContact(
                        isset($data['avatar_url']) ? (string) $data['avatar_url'] : null,
                        (string) ($data['email'] ?? '')
                    ),
                ];
            },
            $contacts->getAll(['per_page' => 3, 'orderby' => 'created_at', 'order' => 'DESC'])
        );

        $activeAutomations = array_map(
            static function ($automation): array {
                $data = $automation->toArray();
                return [
                    'id' => (int) ($data['id'] ?? 0),
                    'name' => (string) ($data['name'] ?? ''),
                    'status' => (string) ($data['status'] ?? ''),
                    'trigger_type' => (string) ($data['trigger_type'] ?? ''),
                ];
            },
            $automations->getAll(['per_page' => 3, 'status' => 'active', 'orderby' => 'created_at', 'order' => 'DESC'])
        );

        $contactCount = $contacts->getTotalCount();
        $campaignCount = (int) $campaigns->getCount();
        $automationCount = $automations->getCount();

        return $this->successResponse([
            'stats' => $this->overviewStats(),
            'recentContacts' => $recentContacts,
            'recentCampaigns' => $campaigns->getPerformanceList(3),
            'activeAutomations' => $activeAutomations,
            'onboarding' => [
                'hasTags' => ((int) $tags->getCount()) > 0,
                'hasContacts' => $contactCount > 0,
                'hasCampaigns' => $campaignCount > 0,
                'hasAutomations' => $automationCount > 0,
                'hasTemplates' => $templates->getCount() > 0,
            ],
        ]);
    }

    /**
     * Overview: KPI tiles plus 30-day contact-growth and email-engagement
     * mini-series.
     */
    public function getDashboard(\WP_REST_Request $request): \WP_REST_Response
    {
        $contacts = new ContactRepository();
        $emailLogs = new EmailLogRepository();

        // UTC throughout: the series buckets a UTC-stored created_at, so "today"
        // and the window must be UTC days too (gmdate), not site-local.
        $end = gmdate('Y-m-d');
        $start = gmdate('Y-m-d', (int) strtotime($end . ' UTC -29 days'));
        $expr = DateBucketer::sqlExpr('created_at', DateBucketer::DAY);
        $keys = DateBucketer::periods($start, $end, DateBucketer::DAY);

        $growthRaw = $contacts->getGrowthSeries($start, $end, $expr);
        $emailRaw = $emailLogs->getEngagementSeries($start, $end, $expr);

        return $this->successResponse([
            'stats' => $this->overviewStats(),
            'contactsSeries' => $this->fillCountSeries($keys, $growthRaw),
            'emailSeries' => $this->fillEngagementSeries($keys, $emailRaw),
        ]);
    }

    /**
     * Shared KPI block used by both the landing dashboard and the analytics
     * overview tab.
     *
     * @return array<string, int|float>
     */
    private function overviewStats(): array
    {
        $contacts = new ContactRepository();
        $campaigns = new CampaignRepository();
        $automations = new AutomationRepository();
        $emailLogs = new EmailLogRepository();

        $campaignStats = $campaigns->getSummaryStats();
        $automationStats = $automations->getSummaryStats();

        return [
            'totalContacts' => $contacts->getTotalCount(),
            'totalCampaigns' => (int) ($campaignStats['total_campaigns'] ?? 0),
            'activeAutomations' => (int) ($automationStats['active_automations'] ?? 0),
            'emailsSent' => $emailLogs->getSentTotal(),
            'avgOpenRate' => (float) ($campaignStats['avg_open_rate'] ?? 0),
            'avgClickRate' => (float) ($campaignStats['avg_click_rate'] ?? 0),
        ];
    }

    /**
     * Contacts tab: growth over time + status/tag/list breakdowns.
     */
    public function getContactsGrowth(\WP_REST_Request $request): \WP_REST_Response
    {
        $contacts = new ContactRepository();

        [$start, $end] = $this->resolveRange($request);
        $bucket = DateBucketer::choose($start, $end);
        $expr = DateBucketer::sqlExpr('created_at', $bucket);
        $keys = DateBucketer::periods($start, $end, $bucket);

        $growthRaw = $contacts->getGrowthSeries($start, $end, $expr);

        return $this->successResponse([
            'bucket' => $bucket,
            'total' => $contacts->getTotalCount(),
            'series' => $this->fillCountSeries($keys, $growthRaw),
            'byStatus' => $contacts->getStatusBreakdown(),
            'topTags' => $contacts->getTopTags(8),
            'topLists' => $contacts->getTopLists(8),
            'topCountries' => $contacts->getTopCountries(8),
        ]);
    }

    /**
     * Emails tab: sent/opened/clicked over time + delivery/rate summary.
     */
    public function getEmailStats(\WP_REST_Request $request): \WP_REST_Response
    {
        $emailLogs = new EmailLogRepository();

        [$start, $end] = $this->resolveRange($request);
        $bucket = DateBucketer::choose($start, $end);
        $expr = DateBucketer::sqlExpr('created_at', $bucket);
        $keys = DateBucketer::periods($start, $end, $bucket);

        $emailRaw = $emailLogs->getEngagementSeries($start, $end, $expr);

        return $this->successResponse([
            'bucket' => $bucket,
            'series' => $this->fillEngagementSeries($keys, $emailRaw),
            'performance' => $emailLogs->getPerformance($start, $end),
        ]);
    }

    /**
     * Campaigns tab: summary KPIs + performance table + top campaigns.
     */
    public function getCampaignPerformance(\WP_REST_Request $request): \WP_REST_Response
    {
        $campaigns = new CampaignRepository();

        return $this->successResponse([
            'summary' => $campaigns->getSummaryStats(),
            'campaigns' => $campaigns->getPerformanceList(20),
            'top' => $campaigns->getTopCampaigns('open_rate', 5),
        ]);
    }

    /**
     * Resolve date_from/date_to request params to a safe [start, end] pair of
     * `Y-m-d` strings, defaulting to the last 30 days.
     *
     * @return array{0: string, 1: string}
     */
    private function resolveRange(\WP_REST_Request $request): array
    {
        $rawTo = sanitize_text_field((string) ($request->get_param('date_to') ?? ''));
        $rawFrom = sanitize_text_field((string) ($request->get_param('date_from') ?? ''));

        // Calendar-day range interpreted in UTC (the series buckets a UTC-stored
        // column). Parse the request dates as UTC and default "today" to the UTC
        // day, so labels and buckets line up regardless of the site timezone.
        $end = ($rawTo !== '' && $this->validateDate($rawTo))
            ? gmdate('Y-m-d', (int) strtotime($rawTo . ' UTC'))
            : gmdate('Y-m-d');

        $start = ($rawFrom !== '' && $this->validateDate($rawFrom))
            ? gmdate('Y-m-d', (int) strtotime($rawFrom . ' UTC'))
            : gmdate('Y-m-d', (int) strtotime($end . ' UTC -29 days'));

        if ($start > $end) {
            [$start, $end] = [$end, $start];
        }

        return [$start, $end];
    }

    /**
     * Zero-fill a single-count series against the full set of bucket keys.
     *
     * @param array<int, string>   $keys
     * @param array<string, int>   $raw
     * @return array<int, array{date: string, count: int}>
     */
    private function fillCountSeries(array $keys, array $raw): array
    {
        return array_map(static fn (string $key): array => [
            'date' => $key,
            'count' => (int) ($raw[$key] ?? 0),
        ], $keys);
    }

    /**
     * Zero-fill the sent/opened/clicked series against the full set of keys.
     *
     * @param array<int, string>                                          $keys
     * @param array<string, array{sent: int, opened: int, clicked: int}>  $raw
     * @return array<int, array{date: string, sent: int, opened: int, clicked: int}>
     */
    private function fillEngagementSeries(array $keys, array $raw): array
    {
        return array_map(static fn (string $key): array => [
            'date' => $key,
            'sent' => (int) ($raw[$key]['sent'] ?? 0),
            'opened' => (int) ($raw[$key]['opened'] ?? 0),
            'clicked' => (int) ($raw[$key]['clicked'] ?? 0),
        ], $keys);
    }
}
