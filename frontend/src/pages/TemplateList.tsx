import { Button, Input, Message, Space, Typography } from '@arco-design/web-react';
import { IconExport, IconImport, IconPlus } from '@arco-design/web-react/icon';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CategoryFilter, ImportExportDialog, TemplateCard } from '../components/common';
import { useClauseStore } from '../stores/clause';
import { useInstanceStore } from '../stores/instance';
import { useTemplateStore } from '../stores/template';
import { TemplateCategory, TEMPLATE_CATEGORY_LABELS } from '../types/enums';

export function TemplateList() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('all');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState<'export' | 'import'>('export');
  const { templates, loadTemplates, createTemplate, duplicateTemplate, deleteTemplate } = useTemplateStore();
  const { createFromTemplate, loadInstances } = useInstanceStore();
  const { loadClauses } = useClauseStore();

  useEffect(() => {
    void Promise.all([loadTemplates(), loadInstances(), loadClauses()]);
  }, [loadClauses, loadInstances, loadTemplates]);

  const categoryOptions = Object.values(TemplateCategory).map((value) => ({
    value,
    label: TEMPLATE_CATEGORY_LABELS[value],
    count: templates.filter((template) => template.category === value).length
  }));

  const filteredTemplates = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return templates.filter((template) => {
      const categoryMatched = category === 'all' || template.category === category;
      const keywordMatched =
        !normalizedKeyword ||
        template.title.toLowerCase().includes(normalizedKeyword) ||
        template.tags.some((tag) => tag.toLowerCase().includes(normalizedKeyword));
      return categoryMatched && keywordMatched;
    });
  }, [category, keyword, templates]);

  const createNewTemplate = async () => {
    const template = await createTemplate();
    navigate(`/templates/${template.id}/edit`);
  };

  const createInstance = async (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const instance = await createFromTemplate(template);
    navigate(`/instances/${instance.id}`);
  };

  const handleOpenExport = () => {
    setDialogMode('export');
    setDialogVisible(true);
  };

  const handleOpenImport = () => {
    setDialogMode('import');
    setDialogVisible(true);
  };

  const handleImportComplete = async () => {
    await Promise.all([loadTemplates(), loadInstances(), loadClauses()]);
    Message.success('导入完成');
  };

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <Typography.Title heading={3}>模板库</Typography.Title>
          <Typography.Text type="secondary">管理合同模板，按分类、标签和关键词快速定位。</Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<IconImport />} onClick={handleOpenImport}>
            导入
          </Button>
          <Button icon={<IconExport />} onClick={handleOpenExport}>
            导出
          </Button>
          <Button type="primary" icon={<IconPlus />} onClick={createNewTemplate}>
            新建模板
          </Button>
        </Space>
      </div>

      <div className="toolbar-row">
        <Input.Search allowClear placeholder="搜索模板标题或标签" value={keyword} onChange={setKeyword} />
        <CategoryFilter value={category} options={categoryOptions} onChange={setCategory} />
      </div>

      <div className="template-grid">
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={() => navigate(`/templates/${template.id}/edit`)}
            onDuplicate={() => void duplicateTemplate(template.id)}
            onDelete={() => void deleteTemplate(template.id)}
            onCreateInstance={() => void createInstance(template.id)}
          />
        ))}
      </div>

      {!filteredTemplates.length && <div className="empty-state">没有匹配的模板。</div>}

      <ImportExportDialog
        visible={dialogVisible}
        defaultMode={dialogMode}
        onClose={() => setDialogVisible(false)}
        onImportComplete={handleImportComplete}
      />
    </section>
  );
}
