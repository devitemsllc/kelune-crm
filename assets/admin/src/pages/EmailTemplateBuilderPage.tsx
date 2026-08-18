import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Button, Col, Form, Row, Tooltip, Typography, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { useDispatch, useSelector } from '@store/hooks';
import {
  fetchTemplate,
  createTemplate,
  updateTemplate,
  clearDraftMeta,
} from '../store/slices/emailTemplatesSlice';
import EmailContentEditor from '../components/common/EmailContentEditor';
import PageLoader from '../components/common/PageLoader';
import { getErrorMessage } from '@/utils/getErrorMessage';

const { Title } = Typography;

// Route-based host for the Email Template editor. Metadata (name/description)
// is collected by the info modal on the list page and carried here via the
// store `draftMeta`; this page only drives the content.
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

  const { currentTemplate, draftMeta } = useSelector(
    (state) => state.emailTemplates
  );

  const isNew = id === 'new';
  const [saving, setSaving] = useState(false);
  // A new template needs no seeding; an edit waits until the record's content has
  // been written into the form so the editor opens in the right mode without a
  // flash of the default (builder) editor.
  const [seeded, setSeeded] = useState(isNew);

  // Edit: load the template so the editor can hydrate its content + metadata.
  useEffect(() => {
    if (!isNew && id) {
      dispatch(fetchTemplate(id));
    }
  }, [dispatch, id, isNew]);

  const loadedTemplate =
    !isNew && currentTemplate && String(currentTemplate.id) === String(id)
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
      // Only `builder` reopens Visual; every other/legacy stored mode (incl. the
      // removed html/text) reopens as Rich Text. A record with a block tree but
      // no stored mode is a pre-mode builder design; raw HTML with no tree opens
      // in Rich Text; an empty draft opens fresh in the builder.
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

  // A create flow can only be entered through the list's info modal (which sets
  // draftMeta). A direct visit / refresh of /builder/new has no metadata, so
  // send the user back to the list rather than render an unnamed template.
  if (isNew && !draftMeta) {
    return <Navigate to="/email-templates" replace />;
  }

  // Edit route still resolving the record (or seeding the form from it).
  if (!isNew && (!loadedTemplate || !seeded)) {
    return <PageLoader />;
  }

  const title =
    draftMeta?.name ||
    loadedTemplate?.name ||
    __('Email Template Builder', 'kelune-crm');

  const finish = () => {
    dispatch(clearDraftMeta());
    navigate('/email-templates');
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
    const content = {
      html_content: (values.email_content as string) ?? '',
      json_structure: values.json_structure ?? null,
    };

    setSaving(true);
    try {
      // draftMeta wins (fresh info-modal edits); on a plain edit-refresh it may
      // be null, in which case only the content is updated server-side.
      const data = { ...(draftMeta ?? {}), ...content };
      if (isNew) {
        const created = await dispatch(createTemplate(data)).unwrap();
        message.success(__('Template created successfully', 'kelune-crm'));
        // Stay in the builder on the newly-created template's own route rather
        // than bouncing back to the list.
        dispatch(clearDraftMeta());
        if (created?.id != null) {
          navigate(`/email-templates/builder/${created.id}`, { replace: true });
        }
      } else {
        await dispatch(updateTemplate({ id: id as string, data })).unwrap();
        message.success(__('Template updated successfully', 'kelune-crm'));
        // Stay put on save — the user keeps editing this template.
      }
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          isNew
            ? __('Failed to create template', 'kelune-crm')
            : __('Failed to update template', 'kelune-crm')
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
              style={{ margin: 0, fontWeight: 500, flex: 1, minWidth: 0 }}
            >
              {title}
            </Title>
          </div>
        </Col>
        <Col flex="none">
          <Button type="primary" onClick={handleSave} loading={saving}>
            {__('Save', 'kelune-crm')}
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
    </div>
  );
};

export default EmailTemplateBuilderPage;
