import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MiniMap,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Button,
  Space,
  Row,
  Col,
  Tooltip,
  Dropdown,
  InputNumber,
  Drawer,
  Form,
  Modal,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import ModalFooter from '../common/ModalFooter';
import { useListState } from '../../hooks/useListState';
import { findActionType } from './actionTypeOptions';
import { EMAIL_STEPS } from './emailStepOptions';
import TriggerNode from './nodes/TriggerNode';
import ActionNode from './nodes/ActionNode';
import ConditionNode from './nodes/ConditionNode';
import DelayNode from './nodes/DelayNode';
import StepConfigPanel from './StepConfigPanel';
import AddStepDrawer from './AddStepDrawer';
import type { AutomationStep } from '@/types/models';

const { Title } = Typography;

// Canvas-height preference bounds. Modelled on the email-template Content Width
// control (step 10, "px" addon): a sensible floor/ceiling with a round default.
const CANVAS_HEIGHT_MIN = 300;
const CANVAS_HEIGHT_MAX = 2000;
const CANVAS_HEIGHT_DEFAULT = 600;

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
};

interface AutomationCanvasProps {
  automationId?: number | string;
  automationName?: string;
  /** The automation's own trigger, mirrored onto the canvas trigger node. */
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  initialSteps?: AutomationStep[];
  onSave?: (steps: Record<string, unknown>[]) => Promise<void> | void;
  /** Persists trigger edits back to the automation record (not the steps). */
  onSaveTrigger?: (data: {
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
  }) => Promise<void> | void;
}

const AutomationCanvas = ({
  automationId,
  automationName,
  triggerType,
  triggerConfig,
  initialSteps = [],
  onSave,
  onSaveTrigger,
}: AutomationCanvasProps) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [configDrawerVisible, setConfigDrawerVisible] = useState(false);
  // Reported up by StepConfigPanel when its content editor needs the full
  // viewport (the visual builder).
  const [wideConfigDrawer, setWideConfigDrawer] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  // Which pane of the send_email config is showing. Owned here rather than in
  // the panel because the drawer's footer drives it — same split as the campaign
  // wizard, where the form owns currentStep and renders its own Next/Previous.
  const [emailStep, setEmailStep] = useState(0);
  // Owned here so the drawer footer (Save/Cancel) can submit the step form that
  // lives inside StepConfigPanel.
  const [stepForm] = Form.useForm();
  const stepActionType = Form.useWatch('action_type', stepForm);
  const stepSenderType = Form.useWatch(
    ['action_config', 'sender_type'],
    stepForm
  );
  const isPickingAction = selectedNode?.type === 'action' && !stepActionType;
  const currentAction = findActionType(stepActionType as string | undefined);
  const hasEmailSteps = !isPickingAction && stepActionType === 'send_email';
  const isInitialized = useRef(false);
  // The live ReactFlow instance, captured on init, used to pan the viewport to a
  // freshly inserted step so the user sees where it landed.
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // The automation's trigger, read through refs so seeding the trigger node
  // (loadStepsToCanvas / addTriggerNode) never lists these props as deps — a
  // trigger save updates the record and would otherwise re-run the init effect
  // and reload the whole canvas.
  const triggerTypeRef = useRef(triggerType);
  const triggerConfigRef = useRef(triggerConfig);
  useEffect(() => {
    triggerTypeRef.current = triggerType;
    triggerConfigRef.current = triggerConfig;
  }, [triggerType, triggerConfig]);

  // Autosave bookkeeping. The workflow persists itself on every meaningful
  // canvas change — there is no manual "Save Workflow" button; success/failure is
  // reported with a toast. lastSavedRef holds the JSON last sent so an unchanged
  // canvas (e.g. the load echo, or pure selection) never re-saves; saveTimerRef
  // debounces bursts (drag, rapid edits).
  const [addStepOpen, setAddStepOpen] = useState(false);
  // The action/condition/delay node currently open in the Add/Edit Step drawer,
  // or null when the drawer is adding a new step. Trigger nodes use the separate
  // config drawer below (the tabbed drawer has no trigger tab).
  const [editNode, setEditNode] = useState<Node | null>(null);
  // Canvas height is a user view-preference, persisted in the shared list-state
  // store (same mechanism as listing-page filters) so it survives reloads.
  const [builderPrefs, setBuilderPrefs] = useListState('automation_builder', {
    canvasHeight: CANVAS_HEIGHT_DEFAULT,
  });
  const [heightModalOpen, setHeightModalOpen] = useState(false);
  const [heightDraft, setHeightDraft] = useState<number>(CANVAS_HEIGHT_DEFAULT);
  const lastSavedRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset to the first pane whenever a different step is opened.
  useEffect(() => {
    setEmailStep(0);
  }, [selectedNode?.id]);

  /**
   * Advance the send_email config, validating only the pane being left — the
   * same rule the campaign wizard applies, including the sender fields that only
   * matter in the mode actually chosen.
   */
  const handleEmailNext = async () => {
    // Validate only the pane being left. Basic Info (step 0) checks the identity
    // fields; Content (step 1) checks the email body before the Review step.
    const fieldsToValidate: (string | string[])[] =
      emailStep === 1
        ? [['action_config', 'body']]
        : ['label', ['action_config', 'subject']];

    if (emailStep === 0) {
      if (stepSenderType === 'custom') {
        fieldsToValidate.push(['action_config', 'from_email']);
      } else if (stepSenderType === 'provider') {
        fieldsToValidate.push(['action_config', 'email_provider_id']);
      }
    }

    try {
      await stepForm.validateFields(fieldsToValidate);
      setEmailStep((step) => step + 1);
    } catch {
      message.error(
        emailStep === 1
          ? __('Email content cannot be empty.', 'kelune-crm')
          : __('Please fill in all required fields in this step.', 'kelune-crm')
      );
    }
  };

  /**
   * Swap this step for a different action WITHOUT touching the node — it keeps
   * its id, position and edges, so the branch it sits in stays wired. Only the
   * config is cleared, since the next action reads entirely different keys.
   */
  const handleReplaceAction = () => {
    // setFields (not setFieldsValue): clearing back to `undefined` is what
    // returns the panel to the picker, and setFieldsValue merges rather than
    // reliably unsetting.
    stepForm.setFields([
      { name: 'action_type', value: undefined },
      { name: 'action_config', value: {} },
      { name: 'label', value: '' },
    ]);
    setEmailStep(0);
    setReplaceConfirmOpen(false);
  };

  // Reset when automation changes
  useEffect(() => {
    isInitialized.current = false;
    setNodes([]);
    setEdges([]);
  }, [automationId]);

  // Convert the React Flow graph into the ordered step payload the bulk-save
  // endpoint expects. Parent links are sent as indices (not ids) and the branch
  // is carried by the incoming edge's source handle. Returns null when there is
  // no trigger yet — an incomplete graph that must not be persisted.
  const buildStepsPayload = useCallback(
    (nodeList: Node[], edgeList: Edge[]): Record<string, unknown>[] | null => {
      const hasTrigger = nodeList.some((node) => node.type === 'trigger');
      if (!hasTrigger) {
        return null;
      }

      const nodeIdToIndex: Record<string, number> = {};
      nodeList.forEach((node, index) => {
        nodeIdToIndex[node.id] = index;
      });

      return nodeList.map((node, index) => {
        const incomingEdge = edgeList.find((edge) => edge.target === node.id);
        const parentIndex = incomingEdge
          ? nodeIdToIndex[incomingEdge.source]
          : null;
        const branchType = incomingEdge?.sourceHandle || null;

        return {
          automation_id: automationId,
          step_order: index + 1,
          step_type: node.type,
          parent_index: parentIndex,
          branch_type: branchType,
          action_type: node.data.action_type || null,
          action_config: node.data.action_config || {},
          condition_type: node.data.condition_type || null,
          condition_config: node.data.condition_config || {},
          delay_type: node.data.delay_type || null,
          delay_value: node.data.delay_value || null,
          position_x: Math.round(node.position.x),
          position_y: Math.round(node.position.y),
        };
      });
    },
    [automationId]
  );

  // Push the current graph to the server, reporting the outcome with a toast.
  const persist = useCallback(
    async (payload: Record<string, unknown>[], serialized: string) => {
      if (!automationId || !onSave) {
        return;
      }
      lastSavedRef.current = serialized;
      try {
        await onSave(payload);
        message.success(__('Workflow saved', 'kelune-crm'));
      } catch {
        // Un-stamp so the next change (or a fresh edit) re-attempts the save.
        lastSavedRef.current = null;
        message.error(__('Failed to save workflow', 'kelune-crm'));
      }
    },
    [automationId, onSave]
  );

  const loadStepsToCanvas = useCallback(
    (steps: AutomationStep[]) => {
      const newNodes: Node[] = steps.map((step) => ({
        id: String(step.id),
        type: step.step_type,
        position: { x: step.position_x || 250, y: step.position_y || 100 },
        data: {
          label:
            step.action_type || step.condition_type || __('Step', 'kelune-crm'),
          ...step,
          // The trigger's type/config live on the automation record, not the
          // step row, so seed them from the record for display + editing.
          ...(step.step_type === 'trigger'
            ? {
                trigger_type: triggerTypeRef.current,
                trigger_config: triggerConfigRef.current ?? {},
              }
            : {}),
        },
      }));

      // Create edges based on parent relationships
      const newEdges: Edge[] = [];
      steps.forEach((step) => {
        if (step.parent_step_id) {
          // Find parent step to determine source handle
          const parentStep = steps.find((s) => s.id === step.parent_step_id);
          let sourceHandle: string | undefined;

          if (parentStep) {
            // If parent is a condition, use branch_type (yes/no)
            if (parentStep.step_type === 'condition' && step.branch_type) {
              sourceHandle = step.branch_type;
            } else if (parentStep.step_type === 'trigger') {
              sourceHandle = 'trigger-output';
            } else if (parentStep.step_type === 'action') {
              sourceHandle = 'action-output';
            } else if (parentStep.step_type === 'delay') {
              sourceHandle = 'delay-output';
            }
          }

          // Determine targetHandle based on target node type
          let targetHandle: string | undefined;
          switch (step.step_type) {
            case 'trigger':
              targetHandle = undefined; // Triggers don't have input handles
              break;
            case 'action':
              targetHandle = 'action-input';
              break;
            case 'condition':
              targetHandle = 'condition-input';
              break;
            case 'delay':
              targetHandle = 'delay-input';
              break;
            default:
              targetHandle = undefined;
          }

          newEdges.push({
            id: `e${step.parent_step_id}-${step.id}`,
            source: String(step.parent_step_id),
            target: String(step.id),
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            animated: true,
          });
        }
      });

      setNodes(newNodes);
      setEdges(newEdges);
      // Stamp the loaded graph as already-saved so the autosave effect that runs
      // right after this hydration recognises it as unchanged and does not echo
      // it straight back to the server.
      const loaded = buildStepsPayload(newNodes, newEdges);
      lastSavedRef.current = loaded ? JSON.stringify(loaded) : null;
    },
    [buildStepsPayload]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Filter out trigger node deletion attempts
      const filteredChanges = changes.filter((change) => {
        if (change.type === 'remove') {
          const nodeToRemove = nodes.find((n) => n.id === change.id);
          if (nodeToRemove && nodeToRemove.type === 'trigger') {
            message.warning(
              __(
                'Trigger step cannot be deleted. You can change the trigger type in settings.',
                'kelune-crm'
              )
            );
            return false; // Block this change
          }
        }
        return true; // Allow other changes
      });

      setNodes((nds) => applyNodeChanges(filteredChanges, nds));
    },
    [nodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, []);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // Trigger keeps its dedicated config drawer (no trigger tab exists in the
    // tabbed drawer); every other step edits through the same Add/Edit drawer.
    if (node.type === 'trigger') {
      setSelectedNode(node);
      setConfigDrawerVisible(true);
      return;
    }
    setEditNode(node);
    setAddStepOpen(true);
  }, []);

  const addTriggerNode = useCallback(() => {
    setNodes((nds) => {
      // Check if trigger already exists to prevent duplicates
      const hasTrigger = nds.some((node) => node.type === 'trigger');
      if (hasTrigger) {
        return nds; // Don't add another trigger
      }

      const newNode = {
        id: `trigger-${Date.now()}`,
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: __('Trigger Event', 'kelune-crm'),
          trigger_type: triggerTypeRef.current || 'contact_created',
          trigger_config: triggerConfigRef.current ?? {},
        },
      };
      return [...nds, newNode];
    });
  }, []);

  // Initialize canvas with existing steps
  useEffect(() => {
    if (initialSteps && initialSteps.length > 0) {
      loadStepsToCanvas(initialSteps);
      isInitialized.current = true;
    } else if (!isInitialized.current) {
      // Only add default trigger once on first initialization
      addTriggerNode();
      isInitialized.current = true;
    }
  }, [initialSteps, loadStepsToCanvas, addTriggerNode]);

  // Derive a canvas label when the user left the step's Label field blank.
  const defaultStepLabel = (
    stepType: 'action' | 'condition' | 'delay',
    values: Record<string, unknown>
  ): string => {
    if (stepType === 'action') {
      return (
        findActionType(values.action_type as string)?.title ??
        __('Action', 'kelune-crm')
      );
    }
    if (stepType === 'delay') {
      return sprintf(
        // translators: %1$s: amount, %2$s: time unit (e.g. 2 days)
        __('Wait %1$s %2$s', 'kelune-crm'),
        values.delay_value ?? 1,
        values.delay_type ?? 'days'
      );
    }
    const conditionType = (values.condition_type as string) || 'condition';
    return conditionType
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  };

  // Commit a step from the Add/Edit Step drawer: insert a new node or update the
  // edited one (its type may have changed via the tabs), then persist the
  // workflow at once (no debounce — this is an explicit save).
  const handleSubmitStep = (
    stepType: 'action' | 'condition' | 'delay',
    values: Record<string, unknown>,
    editId?: string
  ) => {
    const label =
      (values.label as string) || defaultStepLabel(stepType, values);
    let next: Node[];
    let insertedNode: Node | null = null;
    if (editId) {
      // Replace data wholesale (not merge): a type switch must not leave the
      // previous type's config keys behind in the node.
      next = nodes.map((node) =>
        node.id === editId
          ? { ...node, type: stepType, data: { label, ...values } }
          : node
      );
    } else {
      // Drop the new step just below the lowest existing node — a readable
      // column — rather than stacking by count where it can land off-screen. It
      // starts selected so it reads as "the one just added".
      const lowestY = nodes.reduce(
        (low, node) => Math.max(low, node.position.y),
        0
      );
      const newNode: Node = {
        id: `${stepType}-${Date.now()}`,
        type: stepType,
        position: { x: 250, y: nodes.length ? lowestY + 150 : 50 },
        data: { label, ...values },
        selected: true,
      };
      insertedNode = newNode;
      next = [
        ...nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node
        ),
        newNode,
      ];
    }
    setNodes(next);

    const payload = buildStepsPayload(next, edges);
    if (payload) {
      void persist(payload, JSON.stringify(payload));
    }

    // Pan (keeping the current zoom) to centre the new step in view so the user
    // can see exactly what was added and where.
    if (insertedNode) {
      const zoom = rfRef.current?.getZoom() ?? 1;
      rfRef.current?.setCenter(
        insertedNode.position.x + 120,
        insertedNode.position.y + 40,
        { zoom, duration: 500 }
      );
    }
  };

  // Autosave: whenever the graph actually changes, debounce a bulk save. The
  // load echo and no-op changes (selection) are filtered by comparing against the
  // last-saved JSON, so only real edits — a step added, configured, moved,
  // deleted, or reconnected — hit the network.
  useEffect(() => {
    if (!automationId || !onSave || !isInitialized.current) {
      return;
    }
    const payload = buildStepsPayload(nodes, edges);
    if (!payload) {
      return; // No trigger yet — nothing valid to persist.
    }
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      return; // Unchanged since the last save.
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void persist(payload, serialized);
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [nodes, edges, automationId, onSave, buildStepsPayload, persist]);

  const handleUpdateNode = (
    nodeId: string,
    newData: Record<string, unknown>
  ) => {
    const target = nodes.find((n) => n.id === nodeId);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      )
    );
    setConfigDrawerVisible(false);
    // The node's data just changed, so the autosave effect will pick it up and
    // persist the workflow — no separate save needed here.
    //
    // The trigger is the exception: its type/config are stored on the automation
    // record (not the step row), so persist them there directly.
    if (target?.type === 'trigger') {
      void onSaveTrigger?.({
        trigger_type: newData.trigger_type as string | undefined,
        trigger_config:
          (newData.trigger_config as Record<string, unknown>) ?? {},
      });
    }
  };

  // Remove a step node (never the trigger — it is locked) and its connected
  // edges, then persist. Used by the Add/Edit drawer's delete action.
  const handleDeleteNode = (nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target || target.type === 'trigger') {
      return;
    }
    const nextNodes = nodes.filter((n) => n.id !== nodeId);
    const nextEdges = edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    setAddStepOpen(false);
    setEditNode(null);
    const payload = buildStepsPayload(nextNodes, nextEdges);
    if (payload) {
      void persist(payload, JSON.stringify(payload));
    }
  };

  const openHeightModal = () => {
    setHeightDraft(builderPrefs.canvasHeight);
    setHeightModalOpen(true);
  };

  const saveHeight = () => {
    const clamped = Math.min(
      CANVAS_HEIGHT_MAX,
      Math.max(
        CANVAS_HEIGHT_MIN,
        Math.round(heightDraft || CANVAS_HEIGHT_DEFAULT)
      )
    );
    setBuilderPrefs({ canvasHeight: clamped });
    setHeightModalOpen(false);
  };

  return (
    <div>
      {/* Header — automation title with an "Add Step" action on the right. The
          old left sidebar (Action/Condition/Delay buttons) is gone; steps are
          added through the tabbed Add Step drawer. */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space size={8} align="center">
            <Tooltip title={__('Back to automations', 'kelune-crm')}>
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                href="#/automations"
              />
            </Tooltip>
            <Title level={4} style={{ margin: 0, fontWeight: 500 }}>
              {automationName || __('Workflow Builder', 'kelune-crm')}
            </Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'canvas-height',
                    label: __('Canvas Height', 'kelune-crm'),
                    onClick: openHeightModal,
                  },
                ],
              }}
            >
              <Tooltip title={__('More options', 'kelune-crm')}>
                <Button icon={<MoreOutlined />} />
              </Tooltip>
            </Dropdown>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditNode(null);
                setAddStepOpen(true);
              }}
            >
              {__('Add Step', 'kelune-crm')}
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Canvas Area — height is a saved user preference (see More → Canvas
          height). */}
      <div
        style={{
          height: `${builderPrefs.canvasHeight}px`,
          border: '1px solid #d9d9d9',
          borderRadius: 8,
          position: 'relative',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={(instance) => {
            rfRef.current = instance;
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case 'trigger':
                  return '#faad14';
                case 'action':
                  return '#1890ff';
                case 'condition':
                  return '#fa8c16';
                case 'delay':
                  return '#597ef7';
                default:
                  return '#ddd';
              }
            }}
          />
        </ReactFlow>
      </div>

      {/* Canvas height preference — centered modal, mirrors the small add/edit
          modals on listing pages. */}
      <Modal
        destroyOnHidden
        centered
        width={420}
        title={__('Canvas Height', 'kelune-crm')}
        open={heightModalOpen}
        onCancel={() => setHeightModalOpen(false)}
        footer={null}
      >
        <Form layout="vertical">
          <Form.Item
            label={__('Workflow canvas height', 'kelune-crm')}
            help={sprintf(
              // translators: %1$d: minimum height in pixels, %2$d: maximum height in pixels
              __('Between %1$d and %2$d pixels', 'kelune-crm'),
              CANVAS_HEIGHT_MIN,
              CANVAS_HEIGHT_MAX
            )}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              autoFocus
              value={heightDraft}
              onChange={(value) =>
                setHeightDraft(value ?? CANVAS_HEIGHT_DEFAULT)
              }
              min={CANVAS_HEIGHT_MIN}
              max={CANVAS_HEIGHT_MAX}
              step={10}
              addonAfter="px"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 24 }}>
          <ModalFooter
            okText={__('Save', 'kelune-crm')}
            onOk={saveHeight}
            onCancel={() => setHeightModalOpen(false)}
          />
        </div>
      </Modal>

      {/* Add/Edit Step — tabbed drawer (Action / Condition / Delay) that picks
          and configures a step, then inserts a new one or updates the clicked
          node, and saves. editNode null = adding. */}
      <AddStepDrawer
        open={addStepOpen}
        editNode={editNode}
        onClose={() => {
          setAddStepOpen(false);
          setEditNode(null);
        }}
        onSubmit={handleSubmitStep}
        onDelete={handleDeleteNode}
      />

      {/* Configuration Drawer. Widens to the full viewport while the visual
          builder is the active editor — it needs the room, same as the campaign
          wizard's Content step. */}
      <Drawer
        destroyOnHidden
        // A configured action names itself in the title, so the panel body does
        // not repeat it.
        title={currentAction?.title ?? __('Configure Step', 'kelune-crm')}
        extra={
          !isPickingAction &&
          selectedNode?.type === 'action' && (
            <Button size="small" onClick={() => setReplaceConfirmOpen(true)}>
              {__('Replace', 'kelune-crm')}
            </Button>
          )
        }
        placement="right"
        push={false}
        onClose={() => setConfigDrawerVisible(false)}
        open={configDrawerVisible}
        width={wideConfigDrawer ? '100%' : 800}
        footer={
          // An action step that has not been given a type yet shows only the
          // action picker: there is nothing to save until something is picked.
          isPickingAction ? null : (
            <Space>
              {/* Same navigation shape as the campaign wizard: Next advances
                  while there is a step left, Save commits on the last one. */}
              {hasEmailSteps && emailStep < EMAIL_STEPS.length - 1 ? (
                <Button type="primary" onClick={handleEmailNext}>
                  {__('Next', 'kelune-crm')}
                </Button>
              ) : (
                <Button type="primary" onClick={() => stepForm.submit()}>
                  {__('Save', 'kelune-crm')}
                </Button>
              )}
              {hasEmailSteps && emailStep > 0 && (
                <Button onClick={() => setEmailStep(emailStep - 1)}>
                  {__('Previous', 'kelune-crm')}
                </Button>
              )}
              <Button onClick={() => setConfigDrawerVisible(false)}>
                {__('Cancel', 'kelune-crm')}
              </Button>
            </Space>
          )
        }
      >
        {selectedNode && (
          <StepConfigPanel
            form={stepForm}
            node={selectedNode}
            onUpdate={handleUpdateNode}
            onWideChange={setWideConfigDrawer}
            emailStep={emailStep}
            onEmailStepChange={setEmailStep}
          />
        )}
      </Drawer>

      {/* A real <Modal> rather than Modal.confirm(): the static helpers render
          outside the React tree, so they never see our ConfigProvider — with a
          custom prefixCls that means an unstyled dialog stranded behind the
          drawer. */}
      <Modal
        title={__('Replace this action?', 'kelune-crm')}
        open={replaceConfirmOpen}
        onCancel={() => setReplaceConfirmOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <p>
          {__(
            'This step’s current settings will be cleared. Its position and connections on the canvas stay as they are.',
            'kelune-crm'
          )}
        </p>
        <div style={{ marginTop: 24 }}>
          <ModalFooter
            okText={__('Replace', 'kelune-crm')}
            onOk={handleReplaceAction}
            onCancel={() => setReplaceConfirmOpen(false)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default AutomationCanvas;
