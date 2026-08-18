import React, { useState } from 'react';
import {
  Modal,
  Upload,
  Alert,
  Steps,
  message,
  Select,
  Table,
  Typography,
  Result,
  Button,
} from 'antd';
import type { RcFile } from 'antd/es/upload';
import { FileTextOutlined } from '@ant-design/icons';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import ModalFooter from './ModalFooter';
import { parseCsv } from '../../utils/csv';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';

const { Dragger } = Upload;
const { Step } = Steps;
const { Text } = Typography;

interface ImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Contact fields a CSV column can map to. `email` is required to identify rows.
const CONTACT_FIELDS: { value: string; label: string }[] = [
  { value: 'email', label: __('Email (required)', 'kelune-crm') },
  { value: 'first_name', label: __('First Name', 'kelune-crm') },
  { value: 'last_name', label: __('Last Name', 'kelune-crm') },
  { value: 'company', label: __('Company', 'kelune-crm') },
  { value: 'phone', label: __('Phone', 'kelune-crm') },
  { value: 'address_line1', label: __('Address Line 1', 'kelune-crm') },
  { value: 'address_line2', label: __('Address Line 2', 'kelune-crm') },
  { value: 'city', label: __('City', 'kelune-crm') },
  { value: 'state', label: __('State/Province', 'kelune-crm') },
  { value: 'postal_code', label: __('Postal Code', 'kelune-crm') },
  { value: 'country', label: __('Country', 'kelune-crm') },
  { value: 'status', label: __('Status', 'kelune-crm') },
  { value: 'source', label: __('Source', 'kelune-crm') },
  { value: 'lead_score', label: __('Lead Score', 'kelune-crm') },
  {
    value: 'tags',
    label: __('Tags (comma-separated names)', 'kelune-crm'),
  },
  {
    value: 'lists',
    label: __('Lists (comma-separated names)', 'kelune-crm'),
  },
];

const IGNORE = '__ignore__';

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// Common header aliases → contact field.
const HEADER_ALIASES: Record<string, string> = {
  email: 'email',
  email_address: 'email',
  e_mail: 'email',
  first_name: 'first_name',
  firstname: 'first_name',
  fname: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  lname: 'last_name',
  surname: 'last_name',
  company: 'company',
  organization: 'company',
  phone: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  address: 'address_line1',
  address_line_1: 'address_line1',
  address1: 'address_line1',
  street: 'address_line1',
  address_line_2: 'address_line2',
  address2: 'address_line2',
  city: 'city',
  town: 'city',
  state: 'state',
  province: 'state',
  region: 'state',
  postal_code: 'postal_code',
  postcode: 'postal_code',
  zip: 'postal_code',
  zip_code: 'postal_code',
  country: 'country',
  status: 'status',
  source: 'source',
  lead_score: 'lead_score',
  score: 'lead_score',
  tags: 'tags',
  tag: 'tags',
  lists: 'lists',
  list: 'lists',
};

const guessField = (header: string): string => {
  const key = normalize(header);
  if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
  return CONTACT_FIELDS.some((f) => f.value === key) ? key : IGNORE;
};

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; email: string; message: string }[];
}

const ImportModal = ({ visible, onClose, onSuccess }: ImportModalProps) => {
  const dispatch = useDispatch();
  const [currentStep, setCurrentStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  // CSV column index → contact field (or IGNORE).
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const resetModal = () => {
    setCurrentStep(0);
    setFileName('');
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setResult(null);
  };

  // Once a file is parsed into a string matrix, auto-map columns and advance.
  const ingestRows = (rows: string[][], name: string) => {
    if (rows.length < 2) {
      message.error(
        __(
          'The file needs a header row and at least one data row',
          'kelune-crm'
        )
      );
      return;
    }
    const parsedHeaders = rows[0];
    const autoMapping: Record<number, string> = {};
    const used = new Set<string>();
    parsedHeaders.forEach((header, index) => {
      const guessed = guessField(header);
      // Don't map two columns onto the same field automatically.
      if (guessed !== IGNORE && !used.has(guessed)) {
        autoMapping[index] = guessed;
        used.add(guessed);
      } else {
        autoMapping[index] = IGNORE;
      }
    });
    setFileName(name);
    setHeaders(parsedHeaders);
    setDataRows(rows.slice(1));
    setMapping(autoMapping);
    setCurrentStep(1);
  };

  const handleUpload = (file: RcFile) => {
    // `accept` filters the picker, but a drag-drop can still land anything.
    if (!/\.csv$/i.test(file.name)) {
      message.error(
        __(
          'Only CSV files are supported — export your spreadsheet as CSV first.',
          'kelune-crm'
        )
      );
      return false;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        ingestRows(parseCsv(String(e.target?.result ?? '')), file.name);
      } catch (error) {
        message.error(__('Failed to read file', 'kelune-crm'));
      }
    };
    reader.onerror = () =>
      message.error(__('Failed to read file', 'kelune-crm'));
    reader.readAsText(file);
    return false; // Prevent automatic upload.
  };

  const emailMapped = Object.values(mapping).includes('email');
  const mappedCount = Object.values(mapping).filter(
    (v) => v && v !== IGNORE
  ).length;

  const handleImport = async () => {
    if (!emailMapped) {
      message.error(__('Map a column to Email before importing', 'kelune-crm'));
      return;
    }

    // Turn each CSV data row into a field-keyed object using the mapping.
    const rows = dataRows
      .map((cells) => {
        const obj: Record<string, string> = {};
        headers.forEach((_, index) => {
          const field = mapping[index];
          if (field && field !== IGNORE) {
            obj[field] = (cells[index] ?? '').trim();
          }
        });
        return obj;
      })
      .filter((obj) => obj.email);

    if (rows.length === 0) {
      message.error(__('No rows with an email to import', 'kelune-crm'));
      return;
    }

    setImporting(true);
    dispatch(startGlobalLoading());
    try {
      const response = await api.contacts.import(rows);
      setResult(response.data as ImportResult);
      setCurrentStep(2);
      // Refresh the contact list right away, without waiting for "Done".
      onSuccess();
    } catch (error) {
      message.error(
        getErrorMessage(error) || __('Import failed', 'kelune-crm')
      );
    } finally {
      setImporting(false);
      dispatch(stopGlobalLoading());
    }
  };

  // List already refreshed on import; Done just closes the modal.
  const handleFinish = () => {
    onClose();
  };

  // Actions live in the modal body (no footer prop). Only the mapping step
  // (1) shows Import/Cancel; step 2 (Result) has its own centered Done button.
  const footer =
    currentStep === 1 ? (
      <ModalFooter
        onOk={handleImport}
        okText={sprintf(
          /* translators: %d: number of rows to import. */
          _n('Import %d row', 'Import %d rows', dataRows.length, 'kelune-crm'),
          dataRows.length
        )}
        confirmLoading={importing}
        onCancel={onClose}
        cancelText={__('Cancel', 'kelune-crm')}
      />
    ) : null;

  const mappingColumns = [
    {
      title: __('CSV Column', 'kelune-crm'),
      dataIndex: 'header',
      key: 'header',
      render: (header: string) => <Text strong>{header}</Text>,
    },
    {
      title: __('Sample', 'kelune-crm'),
      dataIndex: 'sample',
      key: 'sample',
      render: (sample: string) => (
        <Text type="secondary" ellipsis style={{ maxWidth: 160 }}>
          {sample || '—'}
        </Text>
      ),
    },
    {
      title: __('Maps To', 'kelune-crm'),
      dataIndex: 'index',
      key: 'maps',
      render: (index: number) => (
        <Select
          value={mapping[index] ?? IGNORE}
          style={{ width: 220 }}
          onChange={(value) =>
            setMapping((prev) => ({ ...prev, [index]: value }))
          }
          options={[
            {
              value: IGNORE,
              label: __('-- Ignore Column --', 'kelune-crm'),
            },
            ...CONTACT_FIELDS.map((f) => ({
              value: f.value,
              label: f.label,
              // Disable a field already taken by another column.
              disabled: Object.entries(mapping).some(
                ([col, val]) => val === f.value && Number(col) !== index
              ),
            })),
          ]}
        />
      ),
    },
  ];

  return (
    <Modal
      destroyOnHidden
      centered
      title={__('Import Contacts', 'kelune-crm')}
      visible={visible}
      onCancel={onClose}
      footer={null}
      afterClose={resetModal}
      width={800}
    >
      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        <Step title={__('Upload File', 'kelune-crm')} />
        <Step title={__('Map Fields', 'kelune-crm')} />
        <Step title={__('Result', 'kelune-crm')} />
      </Steps>

      {currentStep === 0 && (
        <>
          <Alert
            message={__(
              'Upload a CSV file whose first row contains column headers. Contacts are matched by email — existing contacts are updated, new emails are created.',
              'kelune-crm'
            )}
            type="info"
            style={{ marginBottom: 16, border: 'none' }}
          />
          <Dragger
            accept=".csv"
            beforeUpload={handleUpload}
            showUploadList={false}
          >
            <p className="kelune-crm-ant-upload-drag-icon">
              <FileTextOutlined
                style={{ fontSize: 40, color: 'rgba(0,0,0,0.45)' }}
              />
            </p>
            <p className="kelune-crm-ant-upload-text">
              {__('Click or drag file to upload', 'kelune-crm')}
            </p>
            <p className="kelune-crm-ant-upload-hint" style={{ marginTop: 0 }}>
              {__('CSV file (.csv)', 'kelune-crm')}
            </p>
          </Dragger>
        </>
      )}

      {currentStep === 1 && (
        <div>
          <Alert
            message={sprintf(
              /* translators: %s: uploaded file name. */
              __(
                'Reviewing %s. Match each CSV column to the contact field it belongs to using the dropdowns below — any column left as "Ignore Column" is skipped. Email is required so contacts can be matched: existing contacts are updated and new emails are created.',
                'kelune-crm'
              ),
              fileName
            )}
            type={emailMapped ? 'success' : 'warning'}
            style={{ marginBottom: 16, border: 'none' }}
          />
          <Table
            size="small"
            rowKey="index"
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={mappingColumns}
            dataSource={headers.map((header, index) => ({
              key: index,
              index,
              header,
              sample: dataRows[0]?.[index] ?? '',
            }))}
            footer={() =>
              sprintf(
                /* translators: %1$d: total rows, %2$d: mapped column count, %3$d: total columns. */
                __('%1$d rows · %2$d of %3$d columns mapped', 'kelune-crm'),
                dataRows.length,
                mappedCount,
                headers.length
              )
            }
          />
        </div>
      )}

      {footer && <div style={{ marginTop: 24 }}>{footer}</div>}

      {currentStep === 2 && result && (
        <Result
          status={result.errors.length > 0 ? 'warning' : 'success'}
          title={__('Import complete', 'kelune-crm')}
          subTitle={sprintf(
            /* translators: %1$d: created count, %2$d: updated count, %3$d: skipped count */
            __('%1$d created, %2$d updated, %3$d skipped', 'kelune-crm'),
            result.created,
            result.updated,
            result.skipped
          )}
          style={{ padding: 20 }}
        >
          {result.errors.length > 0 && (
            <Table
              size="small"
              rowKey={(r) => `${r.row}-${r.email}`}
              pagination={{ pageSize: 5 }}
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: __('Row', 'kelune-crm'),
                  dataIndex: 'row',
                  key: 'row',
                  width: 70,
                },
                {
                  title: __('Email', 'kelune-crm'),
                  dataIndex: 'email',
                  key: 'email',
                },
                {
                  title: __('Issue', 'kelune-crm'),
                  dataIndex: 'message',
                  key: 'message',
                },
              ]}
              dataSource={result.errors}
            />
          )}
        </Result>
      )}

      {currentStep === 2 && result && (
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Button type="primary" onClick={handleFinish}>
            {__('Done', 'kelune-crm')}
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default ImportModal;
