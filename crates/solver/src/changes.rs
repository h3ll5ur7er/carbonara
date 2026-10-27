//! Models and solutions as changes to the ones before, so that an edit of a large document sends only what
//! it changed into WebAssembly, and gets back only what that changed in the solution.

use crate::InvalidModel;
use crate::ir::{Changes, Model, ModelChanges, Solution, SolutionChanges};

impl<T: Clone> Changes<T> {
    /// What turns `before` into `after`; `same` tells elements that didn't change.
    pub fn between(before: &[T], after: &[T], same: impl Fn(&T, &T) -> bool) -> Self {
        let set = after
            .iter()
            .enumerate()
            .filter(|&(index, element)| before.get(index).is_none_or(|old| !same(old, element)))
            .map(|(index, element)| (index as u32, element.clone()))
            .collect();
        Changes {
            length: after.len() as u32,
            set,
        }
    }

    /// Why the changes can't apply to a list of `current` elements: an index past the new length, or a
    /// position the list grows by that isn't set.
    fn check(&self, current: usize, what: &str) -> Result<(), InvalidModel> {
        let length = self.length as usize;
        let mut grown = vec![false; length.saturating_sub(current)];
        for &(index, _) in &self.set {
            let index = index as usize;
            if index >= length {
                let problem = format!("{what}: change at {index}, past the length {length}");
                return Err(InvalidModel(problem));
            }
            if let Some(slot) = index.checked_sub(current) {
                grown[slot] = true;
            }
        }
        match grown.iter().position(|&set| !set) {
            Some(gap) => Err(InvalidModel(format!(
                "{what}: nothing at {}, which is new",
                current + gap
            ))),
            None => Ok(()),
        }
    }

    /// Applies checked changes.
    fn apply(self, list: &mut Vec<T>) {
        let length = self.length as usize;
        list.truncate(length);
        let mut set = self.set;
        set.sort_by_key(|&(index, _)| index);
        for (index, element) in set {
            match list.get_mut(index as usize) {
                Some(slot) => *slot = element,
                None => list.push(element),
            }
        }
    }
}

impl ModelChanges {
    /// What turns `before` into `after`. Elements are compared by value; callers that know what they
    /// changed (the TS facade compares by identity) send less.
    pub fn between(before: &Model, after: &Model) -> Self {
        ModelChanges {
            items: after.items,
            nodes: Changes::between(&before.nodes, &after.nodes, equal),
            edges: Changes::between(&before.edges, &after.edges, equal),
            constraints: Changes::between(&before.constraints, &after.constraints, equal),
            blueprints: Changes::between(&before.blueprints, &after.blueprints, equal),
        }
    }

    /// Changes `model`, or leaves it as it was when the changes don't fit it.
    pub fn apply(self, model: &mut Model) -> Result<(), InvalidModel> {
        self.nodes.check(model.nodes.len(), "nodes")?;
        self.edges.check(model.edges.len(), "edges")?;
        self.constraints
            .check(model.constraints.len(), "constraints")?;
        self.blueprints
            .check(model.blueprints.len(), "blueprints")?;
        model.items = self.items;
        self.nodes.apply(&mut model.nodes);
        self.edges.apply(&mut model.edges);
        self.constraints.apply(&mut model.constraints);
        self.blueprints.apply(&mut model.blueprints);
        Ok(())
    }
}

impl SolutionChanges {
    /// What turns `before` into `after`. Numbers are compared bit for bit.
    pub fn between(before: &Solution, after: &Solution) -> Self {
        let bits = |a: &f64, b: &f64| a.to_bits() == b.to_bits();
        SolutionChanges {
            activity: Changes::between(&before.activity, &after.activity, bits),
            flow: Changes::between(&before.flow, &after.flow, bits),
            surplus: unless_same(&before.surplus, &after.surplus),
            deficit: unless_same(&before.deficit, &after.deficit),
            overflow: unless_same(&before.overflow, &after.overflow),
            pin_misses: unless_same(&before.pin_misses, &after.pin_misses),
            instances: Changes::between(&before.instances, &after.instances, equal),
            inlined: unless_same(&before.inlined, &after.inlined),
        }
    }

    /// Changes `solution` into the one these changes were made to. For tests: the TS facade does this.
    pub fn apply(self, solution: &mut Solution) -> Result<(), InvalidModel> {
        self.activity.check(solution.activity.len(), "activity")?;
        self.flow.check(solution.flow.len(), "flow")?;
        self.instances
            .check(solution.instances.len(), "instances")?;
        self.activity.apply(&mut solution.activity);
        self.flow.apply(&mut solution.flow);
        self.instances.apply(&mut solution.instances);
        replace(&mut solution.surplus, self.surplus);
        replace(&mut solution.deficit, self.deficit);
        replace(&mut solution.overflow, self.overflow);
        replace(&mut solution.pin_misses, self.pin_misses);
        replace(&mut solution.inlined, self.inlined);
        Ok(())
    }
}

fn equal<T: PartialEq>(a: &T, b: &T) -> bool {
    a == b
}

/// `after`, unless it's the same as `before`.
fn unless_same<T: PartialEq + Clone>(before: &[T], after: &[T]) -> Option<Vec<T>> {
    (before != after).then(|| after.to_vec())
}

fn replace<T>(list: &mut Vec<T>, new: Option<Vec<T>>) {
    if let Some(new) = new {
        *list = new;
    }
}
