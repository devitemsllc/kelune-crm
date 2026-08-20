import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import {
  Button,
  Col,
  Form,
  Row,
  Space,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { ArrowLeftOutlined, SettingOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { useDispatch, useSelector } from '@store/hooks';
import {
  activateCampaign,
  fetchCampaign,
  pauseCampaign,
  updateCampaign,
} from '../store/slices/campaignsSlice';
import EmailContentEditor from '../components/common/EmailContentEditor';
import PageLoader from '../components/common/PageLoader';
import InlineSwitch from '../components/common/InlineSwitch';
import CampaignForm from '../components/campaigns/CampaignForm';
import {
  campaignDisplayState,
  campaignStateLabel,
  canToggleCampaign,
  isCampaignActive,
} from '../components/campaigns/campaignStatus';
import { getErrorMessage } from '@/utils/getErrorMessage';

const { Title } = Typography;

// Route-based host for the campaign's email body. The campaign always exists
// here — the create drawer persists a draft first — so this page owns the content
// alone; identity, recipients and the send itself live in the Config drawer, the
// same 3-step form the create flow uses.
//
// The editor is the shared EmailContentEditor, so a campaign email is authored on
// exactly the same surface as an email template and an automation send_email step.
const CampaignBuilderPage = () => {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const { selectedCampaign } = useSelector((state) => state.campaigns);

  const [saving, setSaving] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  // Waits until the record's content has been written into the form so the editor
  // opens in the right mode without a flash of the default (builder) editor.
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchCampaign(id));
    }
  }, [dispatch, id]);

  const campaign =
    selectedCampaign && String(selectedCampaign.id) === String(id)
      ? selectedCampaign
      : null;

  // Seed the form from the loaded record once. Only `builder` reopens the visual
  // editor; anything else reopens as Rich Text with its body carried in.
  useEffect(() => {
    if (campaign && !seeded) {
      form.setFieldsValue({
        content_mode:
          campaign.content_mode === 'builder' ? 'builder' : 'richtext',
        email_content: campaign.email_content ?? '',
        json_structure: campaign.json_structure ?? null,
        template_id: campaign.template_id ?? undefined,
      });
      setSeeded(true);
    }
  }, [campaign, seeded, form]);

  // Campaigns are created from the list before the builder opens, so there is no
  // record to edit on a bare /builder/new visit.
  if (id === 'new' || !id) {
    return <Navigate to="/campaigns" replace />;
  }

  // Still resolving the record (or seeding the form from it).
  if (!campaign || !seeded) {
    return <PageLoader />;
  }

  const title = campaign.name || __('Campaign Builder', 'kelune-crm');

  // Activating is the send. The backend refuses an incomplete campaign and says
  // which piece is missing, so its message is surfaced as-is and the switch falls
  // back to the stored status on the refetch.
  const handleToggleStatus = async (activating: boolean) => {
    try {
      if (activating) {
        await dispatch(activateCampaign(id)).unwrap();
        message.success(
          campaignDisplayState({ ...campaign, status: 'active' }) ===
            'scheduled'
            ? __('Campaign scheduled', 'kelune-crm')
            : __('Campaign queued for sending', 'kelune-crm')
        );
      } else {
        await dispatch(pauseCampaign(id)).unwrap();
        message.success(__('Campaign paused', 'kelune-crm'));
      }
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to change campaign status', 'kelune-crm')
        )
      );
    } finally {
      dispatch(fetchCampaign(id));
    }
  };

  const handleSave = async () => {
    try {
      // Validates the "content required" rule EmailContentEditor attaches in
      // every mode (a hidden field carries it in builder mode).
      await form.validateFields();
    } catch {
      message.error(__('Please add email content before saving', 'kelune-crm'));
      return;
    }

    const values = form.getFieldsValue(true);

    setSaving(true);
    try {
      await dispatch(
        updateCampaign({
          id,
          data: {
            email_content: (values.email_content as string) ?? '',
            content_mode: values.content_mode ?? 'builder',
            json_structure: values.json_structure ?? null,
            template_id: values.template_id ?? '',
          },
        })
      ).unwrap();
      message.success(__('Campaign content saved', 'kelune-crm'));
      // Stay put on save — the user keeps editing this campaign.
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to save campaign content', 'kelune-crm')
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="kelune-crm-cc-campaign-builder-container">
      <Row
        justify="space-between"
        align="middle"
        wrap={false}
        gutter={8}
        style={{ marginBottom: 16 }}
      >
        <Col flex="auto" style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            }}
          >
            <Tooltip title={__('Back to campaigns', 'kelune-crm')}>
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/campaigns')}
                style={{ flex: 'none' }}
              />
            </Tooltip>
            <Title
              level={4}
              ellipsis={{ tooltip: title }}
              style={{ margin: 0, fontWeight: 500, minWidth: 0 }}
            >
              {title}
            </Title>
          </div>
        </Col>
        <Col flex="none">
          <Space>
            {/* Dispatch on/off, and the header's only status readout — the same
                control the list carries, so the send is one act in both places. */}
            <InlineSwitch
              inline
              style={{ marginBottom: 0, marginInlineEnd: 8 }}
              label={campaignStateLabel(campaign)}
              checked={isCampaignActive(campaign)}
              disabled={!canToggleCampaign(campaign)}
              onChange={handleToggleStatus}
            />
            <Button
              icon={<SettingOutlined />}
              onClick={() => setConfigOpen(true)}
            >
              {__('Config', 'kelune-crm')}
            </Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              {__('Save Content', 'kelune-crm')}
            </Button>
          </Space>
        </Col>
      </Row>

      <Form form={form} layout="vertical">
        <EmailContentEditor
          form={form}
          modeName="content_mode"
          contentName="email_content"
          structureName="json_structure"
          templateIdName="template_id"
          initialStructure={campaign.json_structure ?? null}
          templateName={title}
          builderRequiredMessage={__(
            'Add email content before saving the campaign',
            'kelune-crm'
          )}
        />
      </Form>

      <CampaignForm
        visible={configOpen}
        editingCampaign={campaign}
        onCancel={() => {
          setConfigOpen(false);
          // The drawer can rename the campaign, change its sender or send it —
          // reload so the header and Review reflect the stored record.
          dispatch(fetchCampaign(id));
        }}
      />
    </div>
  );
};

export default CampaignBuilderPage;
