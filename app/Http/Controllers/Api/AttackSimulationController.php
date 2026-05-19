<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\AuditLogger;
use App\Support\SiteSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\DB;

class AttackSimulationController extends Controller
{
    private const ATTACKS = [
        'sql_injection' => [
            'label' => 'SQL Injection',
            'category' => 'sql_injection',
            'severity' => 'critical',
            'message' => "Simulated SQL injection payload: ' OR 1=1 --",
            'indicator' => 'SQL Injection pattern detected',
        ],
        'xss' => [
            'label' => 'Cross-Site Scripting',
            'category' => 'xss',
            'severity' => 'critical',
            'message' => 'Simulated XSS payload submitted safely as text: <script>alert(1)</script>',
            'indicator' => 'Cross-Site Scripting pattern detected',
        ],
        'broken_session' => [
            'label' => 'Broken Authentication / Session',
            'category' => 'authentication',
            'severity' => 'warning',
            'message' => 'Simulated invalid session token reuse and session bypass attempt.',
            'indicator' => 'Authentication/session risk',
        ],
        'spam_logins' => [
            'label' => 'Spam Failed Logins',
            'category' => 'authentication',
            'severity' => 'warning',
            'message' => 'Simulated repeated failed login attempts for lockout demonstration.',
            'indicator' => 'Authentication/session risk',
        ],
        'brute_force' => [
            'label' => 'Brute Force / Dictionary Attack',
            'category' => 'authentication',
            'severity' => 'critical',
            'message' => 'Simulated brute-force credential guessing sequence.',
            'indicator' => 'Authentication/session risk',
        ],
        'port_scan' => [
            'label' => 'Port Scanning / Service Enumeration',
            'category' => 'network',
            'severity' => 'warning',
            'message' => 'Simulated port scan/service enumeration event for infrastructure log demo.',
            'indicator' => 'Network/infrastructure probing pattern',
        ],
        'mitm' => [
            'label' => 'Man-in-the-Middle',
            'category' => 'network',
            'severity' => 'critical',
            'message' => 'Simulated intercepted communication / MitM alert.',
            'indicator' => 'Network/infrastructure probing pattern',
        ],
        'firewall_evasion' => [
            'label' => 'Firewall / IDS Evasion',
            'category' => 'network',
            'severity' => 'critical',
            'message' => 'Simulated encoded payload and fragmented packet evasion attempt.',
            'indicator' => 'Network/infrastructure probing pattern',
        ],
        'phishing' => [
            'label' => 'Phishing / Spear Phishing Drill',
            'category' => 'social_engineering',
            'severity' => 'warning',
            'message' => 'Simulated phishing awareness drill event.',
            'indicator' => 'Human-factor attack simulation',
        ],
        'physical_testing' => [
            'label' => 'Physical Testing',
            'category' => 'social_engineering',
            'severity' => 'warning',
            'message' => 'Simulated physical testing event: tailgating or rogue USB attempt.',
            'indicator' => 'Human-factor attack simulation',
        ],
        'ddos' => [
            'label' => 'DoS / DDoS Stress Test',
            'category' => 'dos_ddos',
            'severity' => 'critical',
            'message' => 'Simulated DoS/DDoS high-volume traffic condition. No traffic was generated.',
            'indicator' => 'Denial-of-Service stress pattern',
        ],
        'privilege_escalation' => [
            'label' => 'Privilege Escalation',
            'category' => 'privilege',
            'severity' => 'critical',
            'message' => 'Simulated low-privilege to administrator escalation attempt.',
            'indicator' => 'Privilege/post-exploitation pattern',
        ],
        'lateral_movement' => [
            'label' => 'Lateral Movement',
            'category' => 'privilege',
            'severity' => 'critical',
            'message' => 'Simulated movement from one internal system to another.',
            'indicator' => 'Privilege/post-exploitation pattern',
        ],
    ];

    public function index(Request $request)
    {
        $this->ensureDeveloper($request);

        return response()->json([
            'data' => [
                'attacks' => collect(self::ATTACKS)->map(fn ($attack, $key) => [
                    'key' => $key,
                    'label' => $attack['label'],
                    'category' => $attack['category'],
                    'severity' => $attack['severity'],
                    'description' => $attack['message'],
                ])->values(),
                'limits' => [
                    'max_events_per_run' => SiteSettings::integer('developer', 'max_simulation_events_per_run', 100),
                    'safe_mode' => true,
                ],
            ],
        ]);
    }

    public function run(Request $request)
    {
        $this->ensureDeveloper($request);

        $data = $request->validate([
            'attack_type' => ['required', 'string', 'in:'.implode(',', array_keys(self::ATTACKS))],
            'event_count' => ['nullable', 'integer', 'min:1', 'max:250'],
            'target_label' => ['nullable', 'string', 'max:120'],
        ]);

        $max = SiteSettings::integer('developer', 'max_simulation_events_per_run', 100);
        $count = min(max(1, (int) ($data['event_count'] ?? 10)), max(1, $max));
        $template = self::ATTACKS[$data['attack_type']];
        $batch = 'SIM-'.now()->format('YmdHis').'-'.strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
        $target = $data['target_label'] ?? 'DocTracker local demonstration environment';

        for ($i = 1; $i <= $count; $i++) {
            AuditLog::create([
                'user_id' => $request->user()->id,
                'user_email' => $request->user()->email,
                'event_type' => 'security_simulation',
                'module_name' => 'developer_console',
                'action_name' => $data['attack_type'],
                'old_values' => [],
                'new_values' => [
                    'attack_type' => $data['attack_type'],
                    'target_label' => $target,
                    'sequence' => $i,
                    'safe_mode' => true,
                    'note' => 'Log-only simulation. No exploit, traffic flood, scanning, credential attack, or external contact was performed.',
                ],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'severity' => $template['severity'],
                'category' => $template['category'],
                'risk_score' => in_array($template['severity'], ['critical'], true) ? 95 : 70,
                'source' => 'developer_simulator',
                'is_suspicious' => true,
                'metadata' => [
                    'indicator' => $template['indicator'],
                    'batch' => $batch,
                    'safe_mode' => true,
                    'simulation' => true,
                ],
                'message' => $template['message'],
            ]);
        }

        AuditLogger::record(
            $request->user(),
            'transaction',
            'developer_console',
            'simulation_run',
            null,
            [],
            ['attack_type' => $data['attack_type'], 'events_created' => $count, 'batch' => $batch],
            $request,
            'warning',
            "Developer generated {$count} safe log-only attack simulation events.",
            ['source' => 'developer_simulator', 'simulation' => true, 'batch' => $batch]
        );

        return response()->json([
            'data' => [
                'batch' => $batch,
                'events_created' => $count,
                'attack_type' => $data['attack_type'],
                'safe_mode' => true,
                'message' => 'Simulation completed. It created audit log records only and did not perform a real attack.',
            ],
        ]);
    }

    public function history(Request $request)
    {
        $this->ensureDeveloper($request);

        $perPage = min(100, max(10, (int) $request->query('per_page', 25)));
        $page = AuditLog::query()
            ->where('source', 'developer_simulator')
            ->when($request->query('category'), fn ($query, $category) => $query->where('category', $category))
            ->when($request->query('search'), function ($query, $search) {
                $query->where(function ($subquery) use ($search) {
                    $subquery->where('message', 'ilike', "%{$search}%")
                        ->orWhere('action_name', 'ilike', "%{$search}%")
                        ->orWhere('category', 'ilike', "%{$search}%");
                });
            })
            ->latest()
            ->paginate($perPage);

        return response()->json([
            'data' => $page->getCollection()->map(fn (AuditLog $log) => [
                'id' => (string) $log->id,
                'batch' => data_get($log->metadata, 'batch'),
                'category' => $log->category,
                'action_name' => $log->action_name,
                'severity' => $log->severity,
                'risk_score' => $log->risk_score,
                'indicator' => data_get($log->metadata, 'indicator'),
                'message' => $log->message,
                'created_date' => optional($log->created_at)?->toISOString(),
            ])->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
            ],
        ]);
    }

    public function diagnostics(Request $request)
    {
        $this->ensureDeveloper($request);

        return response()->json(['data' => [
            'php_version' => PHP_VERSION,
            'laravel_environment' => App::environment(),
            'debug_mode' => (bool) config('app.debug'),
            'database_connection' => config('database.default'),
            'database_driver' => DB::connection()->getDriverName(),
            'cache_driver' => config('cache.default'),
            'queue_connection' => config('queue.default'),
            'timezone' => config('app.timezone'),
            'safe_simulation_mode' => true,
            'note' => 'Developer simulations write categorized audit logs only. They do not attack networks, perform scans, send traffic floods, or test third-party systems.',
        ]]);
    }

    private function ensureDeveloper(Request $request): void
    {
        $role = strtoupper((string) $request->user()->role);
        abort_unless(in_array($role, ['ADMIN', 'DEVELOPER'], true), 403);
    }
}
