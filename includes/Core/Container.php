<?php

declare(strict_types=1);

namespace KeluneCRM\Core;

class Container
{
    /** @var array<string, mixed> */
    private array $services = [];

    /** @var array<string, callable> */
    private array $factories = [];

    /** @var array<string, bool> */
    private array $shared = [];

    public function register(string $id, callable $factory, bool $shared = true): void
    {
        $this->factories[$id] = $factory;
        $this->shared[$id] = $shared;
    }

    public function get(string $id): mixed
    {
        if (!isset($this->factories[$id])) {
            throw new \Exception(esc_html("Service '{$id}' not found in container."));
        }

        if ($this->shared[$id] && isset($this->services[$id])) {
            return $this->services[$id];
        }

        $service = $this->factories[$id]($this);

        if ($this->shared[$id]) {
            $this->services[$id] = $service;
        }

        return $service;
    }
}
