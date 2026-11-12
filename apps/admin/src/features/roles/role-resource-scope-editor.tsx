"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { Button, Input, Select } from "antd";
import type {
  AuthorizationResource,
  ScopeRow,
} from "@/features/roles/role-resource-scopes";
import styles from "@/app/admin/system/roles/[id]/permissions/page.module.css";

export function RoleResourceScopeEditor({
  rows,
  catalog,
  disabled,
  onChange,
}: {
  rows: ScopeRow[];
  catalog: AuthorizationResource[];
  disabled: boolean;
  onChange: (rows: ScopeRow[]) => void;
}) {
  const known = new Set(catalog.map((item) => item.resourceKey));
  function update(index: number, patch: Partial<ScopeRow>) {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }
  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="scopes-title">资源数据范围</h2>
          <AdminParagraph>
            同一资源的多角色范围冲突时，后端拒绝访问。各业务操作仍按其支持的范围校验。
          </AdminParagraph>
        </div>
        <Button
          disabled={disabled || !catalog.length}
          onClick={() =>
            onChange([
              ...rows,
              {
                localKey: `new-scope-${crypto.randomUUID()}`,
                resourceKey: "",
                scopeType: "self",
                selectedIds: "",
              },
            ])
          }
        >
          添加资源范围
        </Button>
      </div>
      {!rows.length ? (
        <AdminParagraph className={styles.empty}>
          当前使用角色默认数据范围。
        </AdminParagraph>
      ) : (
        <div className={styles.rows}>
          {rows.map((row, index) => {
            const legacy = !!row.resourceKey && !known.has(row.resourceKey);
            return (
              <div className={styles.scopeRow} key={row.localKey}>
                {legacy ? (
                  <div>
                    <ControlHint
                      hint="历史未知资源，仅可保留或移除，不能改写。"
                      fluid
                    >
                      <Input
                        aria-label={`历史资源 ${index + 1}`}
                        value={row.resourceKey}
                        readOnly
                      />
                    </ControlHint>
                  </div>
                ) : (
                  <ControlHint
                    hint="必选，从已实现的业务资源中选择；每个资源只能配置一次。"
                    fluid
                  >
                    <Select
                      aria-label={`资源 ${index + 1}`}
                      placeholder="选择资源"
                      value={row.resourceKey || undefined}
                      disabled={disabled}
                      showSearch
                      optionFilterProp="label"
                      options={catalog.map((item) => ({
                        value: item.resourceKey,
                        label: `${item.label} (${item.resourceKey})`,
                      }))}
                      onChange={(resourceKey: string) =>
                        update(index, { resourceKey })
                      }
                    />
                  </ControlHint>
                )}
                <ControlHint
                  hint="必选，选择本人、商家、指定ID或全部范围，具体操作仍按业务支持的范围校验。"
                  fluid
                >
                  <Select
                    aria-label={`范围类型 ${index + 1}`}
                    value={row.scopeType}
                    disabled={disabled || legacy}
                    onChange={(scopeType: ScopeRow["scopeType"]) =>
                      update(index, {
                        scopeType,
                        selectedIds:
                          scopeType === "selected" ? row.selectedIds : "",
                      })
                    }
                    options={[
                      { value: "self", label: "本人" },
                      { value: "merchant", label: "所属商家" },
                      { value: "selected", label: "指定 ID" },
                      { value: "all", label: "全部" },
                    ]}
                  />
                </ControlHint>
                {row.scopeType === "selected" ? (
                  <ControlHint
                    hint="必填，用英文逗号分隔不重复的正整数ID，例如10,12。"
                    fluid
                  >
                    <Input
                      aria-label={`指定 ID ${index + 1}`}
                      placeholder="以逗号分隔，例如 10, 12"
                      value={row.selectedIds}
                      disabled={disabled || legacy}
                      onChange={(event) =>
                        update(index, { selectedIds: event.target.value })
                      }
                    />
                  </ControlHint>
                ) : (
                  <span className={styles.scopeHint}>无需额外参数</span>
                )}
                <Button
                  danger
                  type="text"
                  disabled={disabled}
                  onClick={() =>
                    onChange(rows.filter((_, rowIndex) => rowIndex !== index))
                  }
                >
                  移除
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
