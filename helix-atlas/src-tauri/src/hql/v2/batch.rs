//! Named bindings and associated entity projections.

use super::selection::wrap;
use crate::hql::{BoundProjection, EntityKind};
use serde_json::{json, Value};

#[derive(Default)]
pub(super) struct Batch {
    pub(super) entries: Vec<Value>,
    pub(super) returns: Vec<String>,
    pub(super) projections: Vec<BoundProjection>,
}
impl Batch {
    pub(super) fn add(&mut self, name: &str, root: Value, returning: bool) {
        self.entries
            .push(json!({"query": {"name": name, "root": root}}));
        if returning {
            self.returns.push(name.to_owned());
        }
    }
    pub(super) fn entities(
        &mut self,
        name: &str,
        input: Value,
        entity: EntityKind,
        properties: Option<&[String]>,
    ) {
        let binding = format!("__{name}_stream");
        self.add(&binding, input, false);
        let stream = || json!({"inject": {"variable": binding}});
        let ids = format!("__{name}_ids");
        let labels = format!("__{name}_labels");
        self.add(
            name,
            wrap("value_map", stream(), json!({"properties": properties})),
            true,
        );
        self.add(&ids, wrap("id", stream(), json!({})), true);
        self.add(&labels, wrap("label", stream(), json!({})), true);
        let endpoints = if entity == EntityKind::Edges {
            let from = format!("__{name}_from");
            let to = format!("__{name}_to");
            self.add(
                &from,
                wrap("id", wrap("in_n", stream(), json!({})), json!({})),
                true,
            );
            self.add(
                &to,
                wrap("id", wrap("out_n", stream(), json!({})), json!({})),
                true,
            );
            Some((from, to))
        } else {
            None
        };
        self.projections.push(BoundProjection {
            variable: name.to_owned(),
            ids,
            labels,
            endpoints,
        });
    }
}
