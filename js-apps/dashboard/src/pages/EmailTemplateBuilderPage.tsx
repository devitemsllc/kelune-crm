import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Button, Col, Form, Row, Tooltip, Typography, message } from 'antd';
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { useDispatch, useSelector } from '@store/hooks';
import {
  fetchTemplate,
  updateTemplate,
} from '../store/slices/emailTemplatesSlice';
import EmailContentEditor from '../components/common/EmailContentEditor';
import PageLoader from '../components/common/PageLoader';
import TemplateInfoModal from '../components/email-templates/TemplateInfoModal';
import type { TemplateInfoValues } from '../components/email-templates/TemplateInfoModal';
import { getErrorMessage } from '@/utils/getErrorMessage';

const { Title } = Typography;

// Route-based host for the Email Template editor. The template is always an
// existing record here — creating one persists an empty draft first — so this
// page edits content, and its name/description through the Settings action.
//
// It hosts the shared EmailContentEditor — the SAME surface campaigns and
// automation send_email steps use — so a template can be authored with the visual
// editor or rich text, and an existing template can be imported as a starting
// point. The chosen editor mode is a UI-only concern: the template itself stores
// just html_content + json_structure, and the mode is recovered on reopen from
// the structure's own `mode` (or whether a block tree is present).
const EmailTemplateBuilderPage = () => {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const { currentTemplate } = useSelector((state) => state.emailTemplates);

  const [saving, setSaving] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  // Waits until the record's content has been written into the form so the editor
  // opens in the right mode without a flash of the default (builder) editor.
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchTemplate(id));
    }
  }, [dispatch, id]);

  const loadedTemplate =
    currentTemplate && String(currentTemplate.id) === String(id)
      ? currentTemplate
      : null;

  // Seed the form from the loaded record once. Templates have no content_mode
  // column, so the editor mode is recovered from the stored structure's own
  // `mode` (written by EmailContentEditor). Fall back for records saved before
  // that existed: a block tree reopens in the visual builder; raw HTML with no
  // tree reopens in the HTML editor; an empty draft opens fresh in the builder.
  useEffect(() => {
    if (loadedTemplate && !seeded) {
      const structure = loadedTemplate.json_structure as {
        mode?: string;
      } | null;
      // Only `builder` reopens Visual; anything else reopens as Rich Text. A
      // block tree with no stored mode is a builder design; raw HTML with no
      // tree opens in Rich Text; an empty draft opens fresh in the builder.
      const stored = structure?.mode;
      const mode =
        stored === 'builder'
          ? 'builder'
          : stored
            ? 'richtext'
            : structure
              ? 'builder'
              : loadedTemplate.html_content
                ? 'richtext'
                : 'builder';
      form.setFieldsValue({
        content_mode: mode,
        email_content: loadedTemplate.html_content ?? '',
        json_structure: loadedTemplate.json_structure ?? null,
      });
      setSeeded(true);
    }
  }, [loadedTemplate, seeded, form]);

  // Templates are created from the list before the editor opens, so there is no
  // record to edit on a bare /builder/new visit.
  if (id === 'new' || !id) {
    return <Navigate to="/email-templates" replace />;
  }

  // Still resolving the record (or seeding the form from it).
  if (!loadedTemplate || !seeded) {
    return <PageLoader />;
  }

  const title =
    loadedTemplate.name || __('Email Template Builder', 'kelune-crm');

  const finish = () => {
    navigate('/email-templates');
  };

  const handleInfoSubmit = async (values: TemplateInfoValues) => {
    try {
      await dispatch(updateTemplate({ id, data: { ...values } })).unwrap();
      setInfoModalOpen(false);
      message.success(__('Template info updated', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to update template info', 'kelune-crm')
        )
      );
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
    const data = {
      html_content: (values.email_content as string) ?? '',
      json_structure: values.json_structure ?? null,
    };

    setSaving(true);
    try {
      await dispatch(updateTemplate({ id, data })).unwrap();
      message.success(__('Template content saved', 'kelune-crm'));
      // Stay put on save — the user keeps editing this template.
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to save template content', 'kelune-crm')
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="kelune-crm-cc-email-template-builder-container">
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
            <Tooltip title={__('Back to templates', 'kelune-crm')}>
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                onClick={finish}
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
            <Tooltip title={__('Edit info', 'kelune-crm')}>
              <Button
                color="default"
                variant="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setInfoModalOpen(true)}
                style={{ flex: 'none' }}
              />
            </Tooltip>
          </div>
        </Col>
        <Col flex="none">
          <Button type="primary" onClick={handleSave} loading={saving}>
            {__('Save Content', 'kelune-crm')}
          </Button>
        </Col>
      </Row>

      <Form form={form} layout="vertical">
        <EmailContentEditor
          form={form}
          modeName="content_mode"
          contentName="email_content"
          structureName="json_structure"
          initialStructure={loadedTemplate?.json_structure ?? null}
          templateName={title}
          builderRequiredMessage={__(
            'Add email content before saving the template',
            'kelune-crm'
          )}
        />
      </Form>

      <TemplateInfoModal
        open={infoModalOpen}
        template={loadedTemplate}
        onCancel={() => setInfoModalOpen(false)}
        onSubmit={handleInfoSubmit}
      />
    </div>
  );
};

export default EmailTemplateBuilderPage;
