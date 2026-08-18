<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

class DeviceDetectionService
{
    /**
     * Detect device information from user agent
     *
     * @param mixed $user_agent
     * @return array<string, string>
     */
    public function detect($user_agent): array
    {
        if (empty($user_agent)) {
            return [
                'device_type' => 'unknown',
                'browser' => 'unknown',
                'os' => 'unknown',
            ];
        }

        return [
            'device_type' => $this->detectDeviceType($user_agent),
            'browser' => $this->detectBrowser($user_agent),
            'os' => $this->detectOS($user_agent),
        ];
    }

    /**
     * Detect device type
     *
     * @param mixed $user_agent
     */
    private function detectDeviceType($user_agent): string
    {
        // Mobile
        if (preg_match('/(android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini)/i', $user_agent)) {
            if (preg_match('/(ipad|tablet|playbook|silk)/i', $user_agent)) {
                return 'tablet';
            }
            return 'mobile';
        }

        return 'desktop';
    }

    /**
     * Detect browser
     *
     * @param mixed $user_agent
     */
    private function detectBrowser($user_agent): string
    {
        $browsers = [
            'Edge' => 'Edg',
            'Chrome' => 'Chrome',
            'Safari' => 'Safari',
            'Firefox' => 'Firefox',
            'Opera' => 'OPR',
            'Internet Explorer' => 'MSIE|Trident',
        ];

        foreach ($browsers as $name => $pattern) {
            if (preg_match('/' . $pattern . '/i', $user_agent)) {
                return $name;
            }
        }

        return 'unknown';
    }

    /**
     * Detect operating system
     *
     * @param mixed $user_agent
     */
    private function detectOS($user_agent): string
    {
        $os_array = [
            'Windows' => 'Windows',
            'Mac OS' => 'Mac|Macintosh',
            'Linux' => 'Linux',
            'iOS' => 'iPhone|iPad|iPod',
            'Android' => 'Android',
            'BlackBerry' => 'BlackBerry',
        ];

        foreach ($os_array as $name => $pattern) {
            if (preg_match('/' . $pattern . '/i', $user_agent)) {
                return $name;
            }
        }

        return 'unknown';
    }
}
