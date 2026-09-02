<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Models\Contact;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Support\ContactIdentity;

class ContactsController extends BaseController
{
    protected string $restBase = 'contacts';

    private \KeluneCRM\Repositories\ContactRepository $repository;

    public function __construct()
    {
        $this->repository = new ContactRepository();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        // Collection endpoints
        register_rest_route($namespace, '/' . $this->restBase, [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getItems'],
                'permission_callback' => [$this, 'checkReadPermission'],
                'args' => $this->getCollectionParams(),
            ],
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'createItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
                'args' => $this->getEndpointArgs('create'),
            ],
        ]);

        // Single item endpoints
        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getItem'],
                'permission_callback' => [$this, 'checkReadPermission'],
                'args' => [
                    'id' => [
                        'validate_callback' => fn ($param): bool => is_numeric($param),
                    ],
                ],
            ],
            [
                'methods' => \WP_REST_Server::EDITABLE,
                'callback' => [$this, 'updateItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
                'args' => $this->getEndpointArgs('update'),
            ],
            [
                'methods' => \WP_REST_Server::DELETABLE,
                'callback' => [$this, 'deleteItem'],
                'permission_callback' => [$this, 'checkDeletePermission'],
            ],
        ]);

        // Additional endpoints
        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/tags', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getTags'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/tags', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'addTags'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/tags', [
            'methods' => \WP_REST_Server::DELETABLE,
            'callback' => [$this, 'removeTags'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/events', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getEvents'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/notes', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getNotes'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/notes', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'addNote'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/bulk', [
            'methods' => \WP_REST_Server::EDITABLE,
            'callback' => [$this, 'bulkUpdate'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/bulk-delete', [
            'methods' => \WP_REST_Server::DELETABLE,
            'callback' => [$this, 'bulkDelete'],
            'permission_callback' => [$this, 'checkDeletePermission'],
        ]);

        // Export contacts to CSV (honours the same filters as the list view).
        register_rest_route($namespace, '/' . $this->restBase . '/export', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'exportCsv'],
            'permission_callback' => [$this, 'checkReadPermission'],
            'args' => [
                'search' => ['sanitize_callback' => 'sanitize_text_field'],
                'status' => [
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                    'validate_callback' => 'rest_validate_request_arg',
                    'enum' => array_merge([''], Contact::STATUSES),
                ],
                'tags' => ['sanitize_callback' => 'sanitize_text_field'],
                'lists' => ['sanitize_callback' => 'sanitize_text_field'],
                'columns' => ['sanitize_callback' => 'sanitize_text_field'],
                'limit' => ['sanitize_callback' => 'absint'],
                'offset' => ['sanitize_callback' => 'absint'],
            ],
        ]);

        // Import contacts from parsed CSV rows (upsert by email).
        register_rest_route($namespace, '/' . $this->restBase . '/import', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'importItems'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);
    }

    public function getItems(\WP_REST_Request $request): \WP_REST_Response
    {
        $params = $this->getPaginationParams($request);
        $filters = $this->getFilterParams($request);

        $contacts = $this->repository->getAllWithFilters($params, $filters);
        $total = $this->repository->getCountWithFilters($filters);

        // Resolved once per request, not per contact: the setting lookup is
        // cached but is_email()/hashing are not.
        $avatarService = new \KeluneCRM\Services\AvatarService();

        $contactsArray = array_map(function ($contact) use ($avatarService) {
            $contactData = $contact->toArray();
            $contactData['tags'] = $this->repository->getTags($contactData['id']);
            $contactData['lists'] = $this->repository->getLists($contactData['id']);

            // Overwrites the raw column with the resolved avatar: the stored
            // value wins, else a Gravatar when opted in, else '' for initials.
            $contactData['avatar_url'] = $avatarService->forContact(
                isset($contactData['avatar_url']) ? (string) $contactData['avatar_url'] : null,
                (string) ($contactData['email'] ?? '')
            );

            return $contactData;
        }, $contacts);

        $response = $this->successResponse($contactsArray);
        $response->header('X-WP-Total', (string) $total);
        $response->header('X-WP-TotalPages', (string) ceil($total / $params['per_page']));

        return $response;
    }

    public function getItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $contact = $this->repository->find($id);

        if (!$contact) {
            return $this->errorResponse(__('Contact not found', 'kelune-crm'), 'not_found', 404);
        }

        $contactData = $contact->toArray();
        $contactData['notes'] = $this->repository->getNotes($id);
        $contactData['tags'] = $this->repository->getTags($id);
        $contactData['lists'] = $this->repository->getLists($id);

        return $this->prepareResponse($contactData);
    }

    public function createItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $data = $this->prepareItemForDatabase($request);

        $notes = isset($data['notes']) ? $data['notes'] : null;
        $tag_ids = isset($data['tag_ids']) ? $data['tag_ids'] : [];
        $list_ids = isset($data['list_ids']) ? $data['list_ids'] : [];
        unset($data['notes'], $data['tag_ids'], $data['list_ids']);
        unset($data['deleted_note_ids']); // Not a contact column; only relevant on update

        $problem = $this->checkRequiredFields($data);
        if ($problem !== null) {
            return $problem;
        }

        // Mirror the column default rather than leaving a new contact statusless.
        if (null === $data['status']) {
            $data['status'] = Contact::STATUS_ACTIVE;
        }

        if ($this->repository->findByEmail((string) ($data['email'] ?? ''))) {
            return $this->errorResponse(__('Email already exists', 'kelune-crm'), 'email_exists');
        }

        // No address means no unique index to catch a repeat.
        if (trim((string) ($data['email'] ?? '')) === ''
            && $this->repository->findAddresslessMatch(ContactIdentity::duplicateValues($data))) {
            return $this->errorResponse(
                __('A contact with these details already exists', 'kelune-crm'),
                'contact_exists'
            );
        }

        // Drop the fields the request didn't carry so the column defaults apply
        // instead of writing NULL into them.
        $data = array_filter($data, static fn ($value): bool => null !== $value);

        $contact = new Contact($data);
        $id = $this->repository->save($contact);

        if (!$id) {
            return $this->errorResponse(__('Failed to create contact', 'kelune-crm'), 'create_failed', 500);
        }

        $contact->setId($id);

        if (!empty($notes)) {
            $this->repository->addNote($id, $notes, get_current_user_id());
        }

        if (!empty($tag_ids) && is_array($tag_ids)) {
            $this->repository->addTags($id, $tag_ids);
        }

        if (!empty($list_ids) && is_array($list_ids)) {
            $this->repository->addLists($id, $list_ids);
        }

        // Hook contract: contact id + data array.
        do_action('kelune_crm_contact_created', (int) $contact->getId(), $contact->toArray());

        return $this->prepareResponse($contact->toArray());
    }

    public function updateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $contact = $this->repository->find($id);

        if (!$contact) {
            return $this->errorResponse(__('Contact not found', 'kelune-crm'), 'not_found', 404);
        }

        $data = $this->prepareItemForDatabase($request);

        $problem = $this->checkRequiredFields($data, $contact->toArray());
        if ($problem !== null) {
            return $problem;
        }

        $notes = isset($data['notes']) ? $data['notes'] : null;
        $tag_ids = array_key_exists('tag_ids', $data) ? $data['tag_ids'] : null;
        $list_ids = array_key_exists('list_ids', $data) ? $data['list_ids'] : null;
        $deleted_note_ids = array_key_exists('deleted_note_ids', $data) ? $data['deleted_note_ids'] : null;
        unset($data['notes'], $data['tag_ids'], $data['list_ids'], $data['deleted_note_ids']);

        foreach ($data as $key => $value) {
            if ($value !== null) {
                $contact->set($key, $value);
            }
        }

        $updated = $this->repository->update($contact);

        if (!$updated) {
            return $this->errorResponse(__('Failed to update contact', 'kelune-crm'), 'update_failed', 500);
        }

        if (!empty($deleted_note_ids) && is_array($deleted_note_ids)) {
            $this->repository->deleteNotes($deleted_note_ids);
        }

        if (!empty($notes)) {
            $this->repository->addNote($id, $notes, get_current_user_id());
        }

        if ($tag_ids !== null && is_array($tag_ids)) {
            $existingTags = $this->repository->getTags($id);
            if (!empty($existingTags)) {
                $existingTagIds = array_column($existingTags, 'id');
                $this->repository->removeTags($id, $existingTagIds);
            }
            if (!empty($tag_ids)) {
                $this->repository->addTags($id, $tag_ids);
            }
        }

        if ($list_ids !== null && is_array($list_ids)) {
            $existingLists = $this->repository->getLists($id);
            if (!empty($existingLists)) {
                $existingListIds = array_column($existingLists, 'id');
                $this->repository->removeLists($id, $existingListIds);
            }
            if (!empty($list_ids)) {
                $this->repository->addLists($id, $list_ids);
            }
        }

        // Hook contract: contact id + data array.
        do_action('kelune_crm_contact_updated', (int) $contact->getId(), $contact->toArray());

        return $this->prepareResponse($contact->toArray());
    }

    public function deleteItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $contact = $this->repository->find($id);

        if (!$contact) {
            return $this->errorResponse(__('Contact not found', 'kelune-crm'), 'not_found', 404);
        }

        $deleted = $this->repository->delete($id);

        if (!$deleted) {
            return $this->errorResponse(__('Failed to delete contact', 'kelune-crm'), 'delete_failed', 500);
        }

        do_action('kelune_crm_contact_deleted', $id);

        return $this->successResponse(null, __('Contact deleted successfully', 'kelune-crm'));
    }

    public function getTags(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $tags = $this->repository->getTags($id);

        return $this->prepareResponse($tags);
    }

    public function addTags(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $tag_ids = $this->sanitizeIdList($request->get_param('tag_ids'));

        $added = $this->repository->addTags($id, $tag_ids);

        if (!$added) {
            return $this->errorResponse(__('Failed to add tags', 'kelune-crm'), 'add_tags_failed', 500);
        }

        return $this->successResponse(null, __('Tags added successfully', 'kelune-crm'));
    }

    public function removeTags(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $tag_ids = $this->sanitizeIdList($request->get_param('tag_ids'));

        $removed = $this->repository->removeTags($id, $tag_ids);

        if (!$removed) {
            return $this->errorResponse(__('Failed to remove tags', 'kelune-crm'), 'remove_tags_failed', 500);
        }

        return $this->successResponse(null, __('Tags removed successfully', 'kelune-crm'));
    }

    public function getEvents(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $params = $this->getPaginationParams($request);

        $events = $this->repository->getEvents($id, $params);

        return $this->prepareResponse($events);
    }

    public function getNotes(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $params = $this->getPaginationParams($request);

        $notes = $this->repository->getNotes($id, $params);

        return $this->prepareResponse($notes);
    }

    public function addNote(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $content = $this->sanitizeInput($request->get_param('content'), 'textarea');

        if (empty($content)) {
            return $this->errorResponse(__('Note content is required', 'kelune-crm'), 'content_required');
        }

        $note_id = $this->repository->addNote($id, $content, get_current_user_id());

        if (!$note_id) {
            return $this->errorResponse(__('Failed to add note', 'kelune-crm'), 'add_note_failed', 500);
        }

        return $this->successResponse(['id' => $note_id], __('Note added successfully', 'kelune-crm'));
    }

    /**
     * Fields the bulk endpoint may write, and how each is sanitized. Anything
     * absent here is rejected outright — without this the endpoint would write
     * whatever columns the caller names.
     *
     * @var array<string, string>
     */
    private const BULK_UPDATABLE_FIELDS = [
        'status' => 'text',
        'source' => 'text',
    ];

    public function bulkUpdate(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $ids = $request->get_param('ids');
        $data = $request->get_param('data');

        if (empty($ids) || !is_array($ids)) {
            return $this->errorResponse(__('Invalid contact IDs', 'kelune-crm'), 'invalid_ids');
        }

        if (empty($data) || !is_array($data)) {
            return $this->errorResponse(__('No fields to update', 'kelune-crm'), 'invalid_data');
        }

        $fields = [];
        foreach ($data as $key => $value) {
            $key = (string) $key;

            if (!isset(self::BULK_UPDATABLE_FIELDS[$key])) {
                return $this->errorResponse(
                    /* translators: %s: rejected field name */
                    sprintf(__('The field "%s" cannot be bulk updated', 'kelune-crm'), $key),
                    'invalid_field'
                );
            }

            if ('status' === $key && !Contact::isValidStatus($value)) {
                return $this->errorResponse(__('Invalid contact status', 'kelune-crm'), 'invalid_status');
            }

            $fields[$key] = $this->sanitizeInput($value, self::BULK_UPDATABLE_FIELDS[$key]);
        }

        $updated = 0;
        foreach ($ids as $id) {
            $contact = $this->repository->find(absint($id));
            if ($contact) {
                foreach ($fields as $key => $value) {
                    $contact->set($key, $value);
                }
                if ($this->repository->update($contact)) {
                    $updated++;
                }
            }
        }

        return $this->successResponse(
            ['updated' => $updated],
            /* translators: %d: number of contacts updated */
            sprintf(__('%d contacts updated', 'kelune-crm'), $updated)
        );
    }

    public function bulkDelete(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $ids = $request->get_param('ids');

        if (empty($ids) || !is_array($ids)) {
            return $this->errorResponse(__('Invalid contact IDs', 'kelune-crm'), 'invalid_ids');
        }

        $deleted = 0;
        foreach ($this->sanitizeIdList($ids) as $id) {
            if ($this->repository->delete($id)) {
                $deleted++;
            }
        }

        return $this->successResponse(
            ['deleted' => $deleted],
            /* translators: %d: number of contacts deleted */
            sprintf(__('%d contacts deleted', 'kelune-crm'), $deleted)
        );
    }

    /**
     * Export contacts to CSV, honouring the current list filters. Streams the
     * file directly and terminates (never returns) to avoid REST JSON encoding.
     */
    public function exportCsv(\WP_REST_Request $request): void
    {
        $toIdArray = static function ($value): array {
            if (is_array($value)) {
                $raw = $value;
            } elseif (is_string($value) && $value !== '') {
                $raw = explode(',', $value);
            } else {
                return [];
            }

            return array_values(array_filter(array_map('absint', $raw)));
        };

        $filters = [
            'search' => $this->sanitizeInput($request->get_param('search')),
            'status' => $this->sanitizeInput($request->get_param('status')),
            'tags' => $toIdArray($request->get_param('tags')),
            'lists' => $toIdArray($request->get_param('lists')),
        ];

        // Selected columns: keep the canonical order, drop anything unknown.
        $available = $this->exportableColumns();
        $requested = $request->get_param('columns');
        $requestedKeys = is_array($requested)
            ? $requested
            : (is_string($requested) && $requested !== '' ? explode(',', $requested) : []);
        $requestedKeys = array_map('sanitize_key', $requestedKeys);
        $selected = array_values(array_filter(
            array_keys($available),
            static fn ($key): bool => in_array($key, $requestedKeys, true)
        ));
        if ($selected === []) {
            $selected = array_keys($available);
        }

        $total = $this->repository->getCountWithFilters($filters);
        $limit = absint($request->get_param('limit'));
        $offset = absint($request->get_param('offset'));

        $contacts = $this->repository->getAllWithFilters(
            [
                'per_page' => $limit > 0 ? $limit : max($total, 1),
                'offset' => $offset,
                'orderby' => 'id',
                'order' => 'DESC',
            ],
            $filters
        );

        $csv = $this->generateContactsCsv($contacts, $selected);
        $filename = 'contacts-' . gmdate('Y-m-d') . '-' . time() . '.csv';

        // Stream the CSV as a raw download. Returning it through the REST
        // response would JSON-encode the string (quoting the whole file and
        // escaping newlines), so we send it directly and stop execution.
        if (!headers_sent()) {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($csv));
        }

        // Raw CSV file body — not HTML, so output escaping does not apply.
        echo $csv; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        exit;
    }

    /**
     * Build the CSV payload from a set of Contact models.
     *
     * @param array<int, \KeluneCRM\Models\Contact> $contacts
     * @param array<int, string>                       $selected Column keys to include, in order.
     */
    private function generateContactsCsv(array $contacts, array $selected): string
    {
        $available = $this->exportableColumns();
        // In-memory stream for building the CSV payload; WP_Filesystem has no
        // equivalent for php://temp, and no file touches the filesystem.
        $handle = fopen('php://temp', 'r+'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen

        if ($handle === false) {
            return '';
        }

        // Header row: friendly labels for the selected columns only.
        fputcsv($handle, array_map(static fn ($key): string => $available[$key], $selected));

        foreach ($contacts as $contact) {
            $id = (int) $contact->getId();
            $row = [];
            foreach ($selected as $key) {
                if ($key === 'tags' || $key === 'lists') {
                    $relations = $key === 'tags'
                        ? ($this->repository->getTags($id) ?: [])
                        : ($this->repository->getLists($id) ?: []);
                    $names = array_filter(array_map(
                        static fn ($rel): string => (string) ($rel['name'] ?? ''),
                        $relations
                    ));
                    $row[] = $this->escapeCsvCell(implode(', ', $names));
                } else {
                    $row[] = $this->escapeCsvCell((string) ($contact->get($key) ?? ''));
                }
            }
            fputcsv($handle, $row);
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

        return $csv === false ? '' : $csv;
    }

    /**
     * All columns available for export, mapped to CSV labels, in output order.
     * The importable fields plus the read-only relations and created date.
     *
     * @return array<string, string>
     */
    private function exportableColumns(): array
    {
        return array_merge($this->importableFields(), [
            'tags' => __('Tags', 'kelune-crm'),
            'lists' => __('Lists', 'kelune-crm'),
            'created_at' => __('Created At', 'kelune-crm'),
        ]);
    }

    /**
     * Import contacts from parsed CSV rows. Upserts by email (updates an
     * existing contact, otherwise creates one) and resolves tags/lists by name.
     *
     * @return \WP_REST_Response|\WP_Error
     */
    public function importItems(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $rows = $request->get_param('rows');

        if (!is_array($rows) || $rows === []) {
            return $this->errorResponse(__('No rows to import', 'kelune-crm'), 'no_rows');
        }

        $columns = $this->importableFields();
        $customFieldTypes = $this->customFieldTypes();
        $tagRepository = new \KeluneCRM\Repositories\TagRepository();
        $listRepository = new \KeluneCRM\Repositories\ListRepository();

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        foreach ($rows as $index => $row) {
            $line = (int) $index + 1;

            if (!is_array($row)) {
                $skipped++;
                $errors[] = ['row' => $line, 'email' => '', 'message' => __('Invalid row', 'kelune-crm')];
                continue;
            }

            $data = [];
            foreach (array_keys($columns) as $field) {
                if ($field === 'email' || !array_key_exists($field, $row)) {
                    continue;
                }
                $type = match ($field) {
                    'lead_score' => 'integer',
                    'country' => 'country_code',
                    default => 'text',
                };
                $data[$field] = $this->sanitizeInput($row[$field], $type);
            }

            $supplied = is_scalar($row['email'] ?? null) ? trim((string) $row['email']) : '';

            // Judged as written: sanitize_email() edits rather than rejects, so
            // 'A Name <a@b.com>' would import under the address 'AName@b.com'.
            if ($supplied !== '' && !is_email($supplied)) {
                $skipped++;
                $errors[] = [
                    'row' => $line,
                    'email' => $supplied,
                    'message' => __('Invalid email address', 'kelune-crm'),
                ];
                continue;
            }

            $email = $supplied === '' ? '' : sanitize_email($supplied);
            $data['email'] = $email;

            try {
                // Without an address, matched on the duplicate-match columns so
                // re-importing a file updates rather than repeats.
                $existing = $email === ''
                    ? $this->repository->findAddresslessMatch(ContactIdentity::duplicateValues($data))
                    : $this->repository->findByEmail($email);

                $customValues = $this->extractRowCustomFields($row, $customFieldTypes);

                // Merged onto what is stored, so a file carrying one custom
                // column leaves the other custom values alone.
                if ($customValues !== []) {
                    $storedCustom = $existing ? $existing->get('custom_fields') : null;
                    $data['custom_fields'] = $this->sanitizeCustomFields(array_merge(
                        is_array($storedCustom) ? $storedCustom : [],
                        $customValues
                    ));
                }

                // Judged against what the row leaves behind: an omitted column
                // keeps its stored value, one carried empty blanks it.
                $missing = ContactIdentity::missingFields(
                    $data,
                    $existing ? $existing->toArray() : []
                );

                if ($missing !== []) {
                    $skipped++;
                    $errors[] = [
                        'row' => $line,
                        'email' => $email,
                        'message' => $this->requiredFieldsMessage($missing),
                    ];
                    continue;
                }

                if ($existing) {
                    $id = (int) $existing->getId();
                    foreach ($data as $key => $value) {
                        $existing->set($key, $value);
                    }
                    $this->repository->update($existing);
                    do_action('kelune_crm_contact_updated', $id, $existing->toArray());
                    $updated++;
                } else {
                    $contact = new Contact($data);
                    $id = $this->repository->save($contact);
                    if (!$id) {
                        $skipped++;
                        $errors[] = ['row' => $line, 'email' => $email, 'message' => __('Failed to create contact', 'kelune-crm')];
                        continue;
                    }
                    $contact->setId($id);
                    do_action('kelune_crm_contact_created', $id, $contact->toArray());
                    $created++;
                }

                $this->syncNamedRelations($row['tags'] ?? '', $tagRepository, fn (array $ids) => $this->repository->addTags($id, $ids));
                $this->syncNamedRelations($row['lists'] ?? '', $listRepository, fn (array $ids) => $this->repository->addLists($id, $ids));
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = ['row' => $line, 'email' => $email, 'message' => $e->getMessage()];
            }
        }

        return $this->successResponse(
            [
                'created' => $created,
                'updated' => $updated,
                'skipped' => $skipped,
                'errors' => $errors,
            ],
            sprintf(
                /* translators: %1$d: created count, %2$d: updated count, %3$d: skipped count */
                __('%1$d created, %2$d updated, %3$d skipped', 'kelune-crm'),
                $created,
                $updated,
                $skipped
            )
        );
    }

    /**
     * Resolve a comma-separated list of tag/list names into ids (creating any
     * that don't exist yet) and attach them to a contact via `$attach`.
     *
     * @param mixed                                                     $names
     * @param \KeluneCRM\Repositories\TagRepository|\KeluneCRM\Repositories\ListRepository $repository
     * @param callable(array<int, int>): mixed                         $attach
     */
    private function syncNamedRelations($names, $repository, callable $attach): void
    {
        if (!is_string($names) || trim($names) === '') {
            return;
        }

        $ids = [];
        foreach (explode(',', $names) as $name) {
            $name = sanitize_text_field(trim($name));
            if ($name === '') {
                continue;
            }
            $found = $repository->findByName($name);
            $id = $found ? (int) $found->id : (int) $repository->create(['name' => $name]);
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        if ($ids !== []) {
            $attach(array_values(array_unique($ids)));
        }
    }

    /**
     * Defined custom fields, as field key => field type. An import column not
     * listed here is ignored rather than written into the contact's JSON.
     *
     * @return array<string, string>
     */
    private function customFieldTypes(): array
    {
        $types = [];

        foreach ((new \KeluneCRM\Repositories\CustomFieldRepository())->getAll(['per_page' => 500]) as $field) {
            $key = (string) $field->field_key;

            if ($key !== '') {
                $types[$key] = (string) $field->field_type;
            }
        }

        return $types;
    }

    /**
     * Pull the custom_field__<key> columns out of an import row.
     *
     * @param array<array-key, mixed> $row
     * @param array<string, string> $customFieldTypes
     * @return array<string, string|array<int, string>>
     */
    private function extractRowCustomFields(array $row, array $customFieldTypes): array
    {
        $values = [];
        $prefix = 'custom_field__';

        foreach ($row as $column => $value) {
            if (!is_string($column) || strpos($column, $prefix) !== 0) {
                continue;
            }

            $key = substr($column, strlen($prefix));

            if (!isset($customFieldTypes[$key]) || !is_scalar($value)) {
                continue;
            }

            $value = trim((string) $value);
            $type = $customFieldTypes[$key];

            // Stored in the format the contact editor's date picker reads back;
            // an unrecognised cell is left out rather than stored as text.
            if ($type === 'date' || $type === 'datetime') {
                $date = $this->normalizeDateValue($value, $type === 'datetime');

                if ($date === null) {
                    continue;
                }

                $values[$key] = $date;

                continue;
            }

            // Checkbox cells carry their values comma-separated, like tags.
            if ($type === 'checkbox') {
                $values[$key] = $value === ''
                    ? []
                    : array_values(array_filter(
                        array_map('trim', explode(',', $value)),
                        static fn (string $choice): bool => $choice !== ''
                    ));

                continue;
            }

            $values[$key] = $value;
        }

        return $values;
    }

    /**
     * Canonicalise an imported date cell, or null when it holds no recognised
     * date. A custom date field is a calendar date, so no time zone conversion.
     */
    private function normalizeDateValue(string $value, bool $withTime): ?string
    {
        if ($value === '') {
            return '';
        }

        foreach ($this->dateInputFormats($withTime) as $format) {
            // '!' zeroes the parts the format omits, so a bare date lands on
            // midnight instead of the current time.
            $date = \DateTimeImmutable::createFromFormat('!' . $format, $value);

            // createFromFormat rolls an overflowing part forward, so a parse
            // only counts when it writes back exactly as it came in.
            if ($date instanceof \DateTimeImmutable && $date->format($format) === $value) {
                return $date->format($withTime ? 'Y-m-d H:i:s' : 'Y-m-d');
            }
        }

        return null;
    }

    /**
     * Date formats an import cell is tried against, most specific first.
     *
     * @return list<string>
     */
    private function dateInputFormats(bool $withTime): array
    {
        $dayFirst = ['d/m/Y', 'j/n/Y', 'd-m-Y', 'j-n-Y', 'd.m.Y', 'j.n.Y', 'd/m/y', 'j/n/y'];
        $monthFirst = ['m/d/Y', 'n/j/Y', 'm-d-Y', 'n-j-Y', 'm/d/y', 'n/j/y'];

        $dates = array_merge(
            ['Y-m-d', 'Y/m/d', 'Y.m.d'],
            $this->siteDatePrefersDayFirst()
                ? array_merge($dayFirst, $monthFirst)
                : array_merge($monthFirst, $dayFirst),
            ['d M Y', 'j M Y', 'd F Y', 'j F Y', 'M j, Y', 'F j, Y', 'M d, Y', 'F d, Y']
        );

        if (!$withTime) {
            return $dates;
        }

        $formats = [];

        foreach (['H:i:s', 'H:i', 'h:i:s A', 'h:i A', 'g:i A'] as $time) {
            foreach ($dates as $date) {
                $formats[] = $date . ' ' . $time;
            }
        }

        // A datetime column may still carry a bare date; midnight is implied.
        return array_merge($formats, $dates);
    }

    /** Whether the site writes the day before the month, as in 8/9/2026. */
    private function siteDatePrefersDayFirst(): bool
    {
        $format = (string) preg_replace('/\\\\./', '', (string) get_option('date_format', 'F j, Y'));

        return strcspn($format, 'dj') < strcspn($format, 'mnFM');
    }

    /**
     * Contact columns that participate in import/export, mapped to CSV labels.
     * These are the real, user-writable fields only.
     *
     * @return array<string, string>
     */
    private function importableFields(): array
    {
        return [
            'email' => __('Email', 'kelune-crm'),
            'first_name' => __('First Name', 'kelune-crm'),
            'last_name' => __('Last Name', 'kelune-crm'),
            'company' => __('Company', 'kelune-crm'),
            'phone' => __('Phone', 'kelune-crm'),
            'address_line1' => __('Address Line 1', 'kelune-crm'),
            'address_line2' => __('Address Line 2', 'kelune-crm'),
            'city' => __('City', 'kelune-crm'),
            'state' => __('State', 'kelune-crm'),
            'postal_code' => __('Postal Code', 'kelune-crm'),
            'country' => __('Country', 'kelune-crm'),
            'status' => __('Status', 'kelune-crm'),
            'source' => __('Source', 'kelune-crm'),
            'lead_score' => __('Lead Score', 'kelune-crm'),
        ];
    }

    /**
     * Contact columns this endpoint accepts, and how each is sanitized.
     *
     * @var array<string, string>
     */
    private const WRITABLE_FIELDS = [
        'email' => 'email',
        'first_name' => 'text',
        'last_name' => 'text',
        'company' => 'text',
        'phone' => 'text',
        'address_line1' => 'text',
        'address_line2' => 'text',
        'city' => 'text',
        'state' => 'text',
        'country' => 'country_code',
        'postal_code' => 'text',
        'timezone' => 'text',
        'status' => 'text',
        'source' => 'text',
    ];

    /**
     * Absent fields stay null so updateItem() can tell "not sent" from "set to
     * empty" and leave the stored value alone. Sanitizing an absent param would
     * turn null into '' (sanitize_text_field(null) === ''), so a partial update
     * would blank every column the caller happened not to send.
     *
     * Collection fields use key presence instead of null, because [] is a
     * legitimate instruction to clear the relation.
     *
     * @return array<string, mixed>
     */
    private function prepareItemForDatabase(\WP_REST_Request $request): array
    {
        $data = [];

        foreach (self::WRITABLE_FIELDS as $field => $type) {
            $value = $request->get_param($field);
            $data[$field] = null !== $value ? $this->sanitizeInput($value, $type) : null;
        }

        $notes = $request->get_param('notes');
        $custom_fields = $request->get_param('custom_fields');

        // custom_fields is a free-form map that ends up json_encoded into the
        // contacts table and rendered back into the admin — so both halves are
        // constrained: keys to key-safe strings, values to plain text.
        $data['custom_fields'] = is_array($custom_fields)
            ? $this->sanitizeCustomFields($custom_fields)
            : null;
        $data['notes'] = null !== $notes ? $this->sanitizeInput($notes, 'textarea') : null;

        foreach (['tag_ids', 'list_ids', 'deleted_note_ids'] as $field) {
            if ($request->has_param($field)) {
                $data[$field] = $this->sanitizeIdList($request->get_param($field));
            }
        }

        return $data;
    }

    /**
     * Sanitize a contact's custom_fields map.
     *
     * @param array<string, mixed> $fields
     * @return array<string, string|array<int, string>>
     */
    private function sanitizeCustomFields(array $fields): array
    {
        $clean = [];

        foreach ($fields as $key => $value) {
            $safe_key = sanitize_key((string) $key);

            if ($safe_key === '') {
                continue;
            }

            if (is_array($value)) {
                // Checkbox fields are stored as a list; joining them would
                // change the stored type.
                $clean[$safe_key] = array_values(array_map(
                    static fn ($item): string => sanitize_text_field(is_scalar($item) ? (string) $item : ''),
                    $value
                ));

                continue;
            }

            if (!is_scalar($value)) {
                $value = '';
            }

            $clean[$safe_key] = sanitize_text_field((string) $value);
        }

        return $clean;
    }

    /**
     * Coerce a request param to a list of positive integer ids.
     *
     * Also guards the typed repository calls: these ids reach methods declaring
     * `array $ids`, so a scalar would be an uncaught TypeError, not a 400.
     *
     * @param mixed $ids
     * @return array<int, int>
     */
    private function sanitizeIdList($ids): array
    {
        if (!is_array($ids)) {
            return [];
        }

        return array_values(array_filter(array_map('absint', $ids)));
    }

    /** @return array<string, mixed> */
    private function getCollectionParams(): array
    {
        return [
            'page' => [
                'default' => 1,
                'sanitize_callback' => 'absint',
            ],
            'per_page' => [
                'default' => 20,
                'sanitize_callback' => 'absint',
            ],
            'search' => [
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'orderby' => [
                'default' => 'id',
                'enum' => ['id', 'email', 'first_name', 'last_name', 'company', 'lead_score', 'status', 'created_at', 'updated_at'],
            ],
            'order' => [
                'default' => 'DESC',
                'enum' => ['ASC', 'DESC'],
            ],
            // '' means "no status filter" — the dashboard always sends the key.
            // 'type' + 'validate_callback' are what make 'enum' bite: WP skips
            // enum validation entirely for an arg with no validate_callback.
            'status' => [
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => 'rest_validate_request_arg',
                'enum' => array_merge([''], Contact::STATUSES),
            ],
            'tags' => [
                'type' => 'array',
                'items' => [
                    'type' => 'integer',
                ],
                'sanitize_callback' => function ($value): array {
                    if (is_array($value)) {
                        return array_map('absint', $value);
                    }
                    if (is_string($value)) {
                        return array_map('absint', explode(',', $value));
                    }
                    return [];
                },
            ],
            'lists' => [
                'type' => 'array',
                'items' => [
                    'type' => 'integer',
                ],
                'sanitize_callback' => function ($value): array {
                    if (is_array($value)) {
                        return array_map('absint', $value);
                    }
                    if (is_string($value)) {
                        return array_map('absint', explode(',', $value));
                    }
                    return [];
                },
            ],
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, mixed> $stored
     */
    private function checkRequiredFields(array $data, array $stored = []): ?\WP_Error
    {
        if (ContactIdentity::hasInvalidEmail($data, $stored)) {
            return $this->errorResponse(__('Invalid email address', 'kelune-crm'), 'invalid_email');
        }

        $missing = ContactIdentity::missingFields($data, $stored);

        if ($missing === []) {
            return null;
        }

        return $this->errorResponse($this->requiredFieldsMessage($missing), 'required_fields');
    }

    /**
     * @param array<int, string> $fields
     */
    private function requiredFieldsMessage(array $fields): string
    {
        $available = $this->importableFields();

        $labels = array_map(
            static fn (string $field): string => (string) ($available[$field] ?? $field),
            $fields
        );

        return sprintf(
            /* translators: %s: comma-separated field labels, e.g. "Email, First Name". */
            _n(
                '%s is required',
                'These fields are required: %s',
                count($labels),
                'kelune-crm'
            ),
            implode(', ', $labels)
        );
    }

    /** @return array<string, mixed> */
    private function getEndpointArgs(string $method): array
    {
        $args = [
            // Not `required`: route args are built once at registration, which
            // would freeze the filter's value. The handlers ask per request.
            'email' => [
                'sanitize_callback' => static fn ($param): string => is_scalar($param)
                    ? sanitize_email((string) $param)
                    : '',
                'validate_callback' => static function ($param): bool {
                    // sanitize_email() runs after this and would fatal on an array.
                    if (!is_scalar($param)) {
                        return false;
                    }

                    $value = trim((string) $param);

                    // A blank clears the address, which only some sites allow.
                    return $value === ''
                        ? !ContactIdentity::isEmailRequired()
                        : (bool) is_email($value);
                },
            ],
            'first_name' => [
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'last_name' => [
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'company' => [
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'phone' => [
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'status' => [
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => 'rest_validate_request_arg',
                'enum' => Contact::STATUSES,
            ],
        ];

        if ($method === 'update') {
            $args['id'] = [
                'required' => true,
                'validate_callback' => fn ($param): bool => is_numeric($param),
            ];
        }

        return $args;
    }
}
