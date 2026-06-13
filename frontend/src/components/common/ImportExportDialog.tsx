import {
  Button,
  Checkbox,
  Descriptions,
  Grid,
  Modal,
  Radio,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Typography
} from '@arco-design/web-react';
import { IconCheck, IconClose } from '@arco-design/web-react/icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { persistenceApi } from '../../api/db';
import {
  ConflictInfo,
  ConflictStrategy,
  ImportEntityType,
  IMPORT_ENTITY_LABELS,
  ImportPreviewResult,
  StoreImportSummary,
  TypedExportPayload
} from '../../types/import-export';
import { detectPayloadTypes, downloadJson, generateExportFilename, readJsonFile } from '../../utils/export';

const Row = Grid.Row;
const Col = Grid.Col;

interface ImportExportDialogProps {
  visible: boolean;
  defaultMode?: 'export' | 'import';
  onClose: () => void;
  onImportComplete: () => void;
}

const EXPORT_OPTIONS: { label: string; value: ImportEntityType }[] = [
  { label: '模板', value: 'templates' },
  { label: '条款', value: 'clauses' },
  { label: '实例（含版本记录）', value: 'instances' }
];

export function ImportExportDialog({ visible, defaultMode = 'export', onClose, onImportComplete }: ImportExportDialogProps) {
  const [mode, setMode] = useState<'export' | 'import'>(defaultMode);
  const [exportTypes, setExportTypes] = useState<ImportEntityType[]>(['templates', 'clauses', 'instances']);
  const [exporting, setExporting] = useState(false);

  const [importStep, setImportStep] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importPayload, setImportPayload] = useState<TypedExportPayload | null>(null);
  const [availableTypes, setAvailableTypes] = useState<ImportEntityType[]>([]);
  const [selectedImportTypes, setSelectedImportTypes] = useState<ImportEntityType[]>([]);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [defaultStrategy, setDefaultStrategy] = useState<ConflictStrategy>('skip');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<StoreImportSummary[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setMode(defaultMode);
      setExportTypes(['templates', 'clauses', 'instances']);
      setImportStep(0);
      setSelectedFile(null);
      setImportPayload(null);
      setAvailableTypes([]);
      setSelectedImportTypes([]);
      setPreviewResult(null);
      setConflicts([]);
      setDefaultStrategy('skip');
      setImportResult(null);
    }
  }, [visible, defaultMode]);

  const handleExport = async () => {
    if (exportTypes.length === 0) {
      return;
    }
    setExporting(true);
    try {
      const payload = await persistenceApi.exportByType(exportTypes);
      const filename = generateExportFilename(exportTypes);
      downloadJson(payload, filename);
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (file?: File) => {
    if (!file) {
      return;
    }
    try {
      const payload = await readJsonFile<TypedExportPayload>(file);
      const types = detectPayloadTypes(payload as unknown as Record<string, unknown>);
      if (types.length === 0) {
        Modal.error({
          title: '导入失败',
          content: '文件中没有可导入的数据'
        });
        return;
      }
      setImportPayload(payload);
      setAvailableTypes(types);
      setSelectedImportTypes(types);
      setSelectedFile(file);
      setImportStep(1);
    } catch {
      Modal.error({
        title: '导入失败',
        content: '请确认 JSON 格式正确'
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAnalyze = async () => {
    if (!importPayload || selectedImportTypes.length === 0) {
      return;
    }
    setImporting(true);
    try {
      const result = await persistenceApi.analyzeImportConflicts(importPayload, selectedImportTypes);
      setPreviewResult(result);
      setConflicts(result.conflicts.map((c) => ({ ...c, strategy: defaultStrategy })));
      setImportStep(2);
    } finally {
      setImporting(false);
    }
  };

  const handleConflictStrategyChange = (conflictKey: string, strategy: ConflictStrategy) => {
    setConflicts((prev) =>
      prev.map((c) => {
        const key = `${c.storeName}:${c.id}`;
        return key === conflictKey ? { ...c, strategy } : c;
      })
    );
  };

  const handleBatchUpdateStrategy = (strategy: ConflictStrategy) => {
    setConflicts((prev) => prev.map((c) => ({ ...c, strategy })));
    setDefaultStrategy(strategy);
  };

  const handleImport = async () => {
    if (!importPayload || selectedImportTypes.length === 0) {
      return;
    }
    setImporting(true);
    try {
      const strategies = new Map<string, ConflictStrategy>();
      conflicts.forEach((c) => {
        strategies.set(`${c.storeName}:${c.id}`, c.strategy);
      });
      const result = await persistenceApi.importByType(
        importPayload,
        selectedImportTypes,
        strategies,
        defaultStrategy
      );
      setImportResult(result);
      setImportStep(3);
      onImportComplete();
    } finally {
      setImporting(false);
    }
  };

  const conflictColumns = useMemo(
    () => [
      {
        title: '类型',
        dataIndex: 'storeName',
        width: 100,
        render: (value: ImportEntityType) => (
          <Tag color="arcoblue">{IMPORT_ENTITY_LABELS[value]}</Tag>
        )
      },
      {
        title: '名称',
        dataIndex: 'title',
        render: (value: string, record: ConflictInfo) => (
          <div>
            <div>{value}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              ID: {record.id}
            </div>
          </div>
        )
      },
      {
        title: '现有更新时间',
        dataIndex: 'existing',
        width: 180,
        render: (value: { updatedAt?: string }) => value.updatedAt?.slice(0, 19).replace('T', ' ') || '-'
      },
      {
        title: '导入更新时间',
        dataIndex: 'incoming',
        width: 180,
        render: (value: { updatedAt?: string }) => value.updatedAt?.slice(0, 19).replace('T', ' ') || '-'
      },
      {
        title: '处理方式',
        dataIndex: 'strategy',
        width: 200,
        render: (value: ConflictStrategy, record: ConflictInfo) => (
          <Radio.Group
            type="button"
            size="small"
            value={value}
            onChange={(v: string) => handleConflictStrategyChange(`${record.storeName}:${record.id}`, v as ConflictStrategy)}
          >
            <Radio value="skip">跳过</Radio>
            <Radio value="overwrite">覆盖</Radio>
          </Radio.Group>
        )
      }
    ],
    []
  );

  const newItemColumns = useMemo(
    () => [
      {
        title: '类型',
        dataIndex: 'storeName',
        width: 100,
        render: (value: ImportEntityType) => (
          <Tag color="green">{IMPORT_ENTITY_LABELS[value]}</Tag>
        )
      },
      {
        title: '名称',
        dataIndex: 'title'
      },
      {
        title: 'ID',
        dataIndex: 'id',
        render: (value: string) => <span className="muted">{value}</span>
      }
    ],
    []
  );

  const renderExportPanel = () => (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={5} style={{ marginBottom: 12 }}>
          选择导出内容
        </Typography.Title>
        <Checkbox.Group value={exportTypes} onChange={setExportTypes}>
          <Space direction="vertical" size={8}>
            {EXPORT_OPTIONS.map((opt) => (
              <Checkbox key={opt.value} value={opt.value}>
                {opt.label}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </div>
      <Descriptions
        border
        column={1}
        size="small"
        data={[
          {
            label: '导出说明',
            value: (
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>
                  <IconCheck style={{ color: 'var(--green)', marginRight: 6 }} />
                  导出内容仅包含您勾选的数据类型
                </div>
                <div>
                  <IconCheck style={{ color: 'var(--green)', marginRight: 6 }} />
                  导出实例会自动包含相关的版本记录
                </div>
                <div>
                  <IconClose style={{ color: 'var(--redwood)', marginRight: 6 }} />
                  不会清空或修改现有数据
                </div>
              </div>
            )
          }
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <Button onClick={onClose}>取消</Button>
        <Button
          type="primary"
          loading={exporting}
          disabled={exportTypes.length === 0}
          onClick={handleExport}
        >
          导出 JSON 文件
        </Button>
      </div>
    </Space>
  );

  const renderImportStep0 = () => (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={5} style={{ marginBottom: 12 }}>
          选择导入文件
        </Typography.Title>
        <Typography.Text type="secondary">
          请选择之前导出的 JSON 数据文件，系统将自动识别文件内容并进行冲突检测。
        </Typography.Text>
      </div>
      <Button type="primary" size="large" onClick={() => fileInputRef.current?.click()}>
        选择 JSON 文件
      </Button>
      <Descriptions
        border
        column={1}
        size="small"
        data={[
          {
            label: '导入说明',
            value: (
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>
                  <IconCheck style={{ color: 'var(--green)', marginRight: 6 }} />
                  导入前可预览数据内容和冲突情况
                </div>
                <div>
                  <IconCheck style={{ color: 'var(--green)', marginRight: 6 }} />
                  可选择只导入部分类型的数据
                </div>
                <div>
                  <IconCheck style={{ color: 'var(--green)', marginRight: 6 }} />
                  冲突项可逐条选择覆盖或跳过，不会整库覆盖
                </div>
                <div>
                  <IconCheck style={{ color: 'var(--green)', marginRight: 6 }} />
                  新增数据将直接添加，现有数据保持不变
                </div>
              </div>
            )
          }
        ]}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="visually-hidden"
        onChange={(event) => void handleFileSelect(event.target.files?.[0])}
      />
    </Space>
  );

  const renderImportStep1 = () => (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={5} style={{ marginBottom: 12 }}>
          选择导入类型
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          文件: {selectedFile?.name}（{((selectedFile?.size ?? 0) / 1024).toFixed(1)} KB）
        </Typography.Text>
        <Checkbox.Group value={selectedImportTypes} onChange={setSelectedImportTypes}>
          <Space direction="vertical" size={8}>
            {availableTypes.map((type) => {
              const count = (importPayload?.[type] as unknown[] | undefined)?.length ?? 0;
              return (
                <Checkbox key={type} value={type}>
                  {IMPORT_ENTITY_LABELS[type]}（{count} 条）
                </Checkbox>
              );
            })}
          </Space>
        </Checkbox.Group>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <Button onClick={() => setImportStep(0)}>上一步</Button>
        <Button
          type="primary"
          loading={importing}
          disabled={selectedImportTypes.length === 0}
          onClick={handleAnalyze}
        >
          分析冲突
        </Button>
      </div>
    </Space>
  );

  const renderImportStep2 = () => {
    if (!previewResult) {
      return null;
    }

    const summaryData = previewResult.summaries.map((s) => ({
      key: s.storeName,
      type: IMPORT_ENTITY_LABELS[s.storeName as ImportEntityType],
      total: s.total,
      newCount: s.newCount,
      conflictCount: s.conflictCount
    }));

    return (
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div>
          <Typography.Title heading={5} style={{ marginBottom: 12 }}>
            导入预览
          </Typography.Title>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <div style={{ padding: 16, background: '#f2eadf', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--navy)' }}>
                  {previewResult.totalCount}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  总记录数
                </div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ padding: 16, background: '#e8f5ee', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--green)' }}>
                  {previewResult.newCount}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  新增（无冲突）
                </div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ padding: 16, background: '#fbe9e7', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--redwood)' }}>
                  {previewResult.conflictCount}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  冲突（需处理）
                </div>
              </div>
            </Col>
          </Row>
          <Table
            size="small"
            data={summaryData}
            columns={[
              { title: '类型', dataIndex: 'type', width: 120 },
              { title: '总数', dataIndex: 'total', width: 100 },
              { title: '新增', dataIndex: 'newCount', width: 100 },
              { title: '冲突', dataIndex: 'conflictCount', width: 100 }
            ]}
            pagination={false}
          />
        </div>

        {previewResult.conflictCount > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Typography.Title heading={6} style={{ margin: 0 }}>
                冲突列表
              </Typography.Title>
              <Space>
                <span className="muted" style={{ fontSize: 13 }}>
                  批量设置:
                </span>
                <Button size="small" onClick={() => handleBatchUpdateStrategy('skip')}>
                  全部跳过
                </Button>
                <Button size="small" onClick={() => handleBatchUpdateStrategy('overwrite')}>
                  全部覆盖
                </Button>
              </Space>
            </div>
            <Table
              size="small"
              data={conflicts}
              columns={conflictColumns}
              rowKey={(record) => `${record.storeName}:${record.id}`}
              pagination={{ pageSize: 5 }}
              scroll={{ y: 240 }}
            />
          </div>
        )}

        {previewResult.newCount > 0 && (
          <div>
            <Typography.Title heading={6} style={{ marginBottom: 12 }}>
              新增列表
            </Typography.Title>
            <Table
              size="small"
              data={previewResult.newItems}
              columns={newItemColumns}
              rowKey={(record) => `${record.storeName}:${record.id}`}
              pagination={{ pageSize: 5 }}
              scroll={{ y: 180 }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={() => setImportStep(1)}>上一步</Button>
          <Button
            type="primary"
            status="warning"
            loading={importing}
            onClick={handleImport}
          >
            {previewResult.conflictCount > 0 ? '确认导入（按设置处理冲突）' : '确认导入'}
          </Button>
        </div>
      </Space>
    );
  };

  const renderImportStep3 = () => {
    if (!importResult) {
      return null;
    }

    const resultData = importResult.map((s) => ({
      key: s.storeName,
      type: IMPORT_ENTITY_LABELS[s.storeName as ImportEntityType],
      total: s.total,
      newCount: s.newCount,
      overwrittenCount: s.overwrittenCount,
      skippedCount: s.skippedCount
    }));

    const totalNew = importResult.reduce((sum, s) => sum + s.newCount, 0);
    const totalOverwritten = importResult.reduce((sum, s) => sum + s.overwrittenCount, 0);
    const totalSkipped = importResult.reduce((sum, s) => sum + s.skippedCount, 0);

    return (
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#e8f5ee',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            <IconCheck style={{ fontSize: 36, color: 'var(--green)' }} />
          </div>
          <Typography.Title heading={4} style={{ margin: '0 0 8px' }}>
            导入完成
          </Typography.Title>
          <Typography.Text type="secondary">
            数据已成功导入，请查看下方的导入结果统计
          </Typography.Text>
        </div>

        <Row gutter={16}>
          <Col span={8}>
            <div style={{ padding: 16, background: '#e8f5ee', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--green)' }}>{totalNew}</div>
              <div className="muted" style={{ fontSize: 13 }}>新增记录</div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ padding: 16, background: '#fff3e0', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--amber)' }}>{totalOverwritten}</div>
              <div className="muted" style={{ fontSize: 13 }}>已覆盖</div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ padding: 16, background: '#f5f5f5', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--muted)' }}>{totalSkipped}</div>
              <div className="muted" style={{ fontSize: 13 }}>已跳过</div>
            </div>
          </Col>
        </Row>

        <Table
          size="small"
          data={resultData}
          columns={[
            { title: '类型', dataIndex: 'type', width: 120 },
            { title: '处理总数', dataIndex: 'total', width: 100 },
            { title: '新增', dataIndex: 'newCount', width: 100 },
            { title: '覆盖', dataIndex: 'overwrittenCount', width: 100 },
            { title: '跳过', dataIndex: 'skippedCount', width: 100 }
          ]}
          pagination={false}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button type="primary" onClick={onClose}>
            完成
          </Button>
        </div>
      </Space>
    );
  };

  const renderImportPanel = () => {
    if (importStep === 0) {
      return renderImportStep0();
    }
    if (importStep === 1) {
      return renderImportStep1();
    }
    if (importStep === 2) {
      return renderImportStep2();
    }
    return renderImportStep3();
  };

  const modalStyle = importStep >= 2 ? { width: 900 } : { width: 600 };

  return (
    <Modal
      visible={visible}
      title={null}
      footer={null}
      onCancel={onClose}
      style={modalStyle}
      maskClosable={!importing && !exporting}
    >
      {mode === 'import' && importStep < 3 && (
        <Steps current={importStep} style={{ marginBottom: 24 }} lineless>
          <Steps.Step title="选择文件" />
          <Steps.Step title="选择类型" />
          <Steps.Step title="预览并确认" />
        </Steps>
      )}
      {mode === 'import' && importStep >= 3 ? null : (
        <Tabs
          activeTab={mode}
          onChange={(key) => setMode(key as 'export' | 'import')}
          style={{ marginBottom: 20 }}
        >
          <Tabs.TabPane key="export" title="导出数据" />
          <Tabs.TabPane key="import" title="导入数据" />
        </Tabs>
      )}
      {mode === 'export' ? renderExportPanel() : renderImportPanel()}
    </Modal>
  );
}
