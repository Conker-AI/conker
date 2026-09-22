"""Exercise real local ToolGate editor publications with synthetic data only.

Creates retained acceptance drafts/publications/receipts, temporarily grants their
workflow scopes, and removes those scopes in finally. No external connectors,
models, vault reads or arbitrary scripts are invoked. Credentials are never printed.
"""
import json
from pathlib import Path
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    config = json.loads((ROOT / '.local-run/configuration.json').read_text())
    gateway = config['environments']['gateway']
    headers = {'Content-Type': 'application/json',
               'X-ToolGate-Owner-Key': gateway['GATEWAY_TOOLGATE_OWNER_KEY'],
               'X-ToolGate-Execution-Key': config['environments']['pi']['PI_TOOLGATE_KEY']}

    def request(path, body=None):
        req = urllib.request.Request('http://127.0.0.1:8010/v2/owner/editor-drafts/' + path,
            headers=headers, data=None if body is None else json.dumps(body).encode())
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.load(response)

    def node(identity, kind, content):
        return {'id': identity, 'type': kind, 'label': identity,
                'position': {'x': 0, 'y': 0}, 'config': content}

    def document(identity, nodes, edges):
        for index, item in enumerate(nodes):
            item['position'] = {'x': index * 280, 'y': 80}
        return {'id': identity, 'name': 'Local acceptance ' + identity, 'description': 'Synthetic nested workflow acceptance',
                'kind': 'workflow', 'nodes': nodes, 'edges': edges,
                'inputs': [{'name': 'enabled', 'type': 'boolean', 'required': True}], 'outputs': [],
                'credentialRefs': [], 'effect': 'read', 'agentVisible': False,
                'budgets': {'maxSteps': 40, 'maxLoopItems': 10, 'timeoutMs': 5000}}

    def edge(source, target, branch=None):
        return {'id': source + '-' + target, 'source': source, 'target': target,
                **({'branch': branch} if branch else {})}

    def publish(value):
        identity = value['id']
        request(identity, {'expected_revision': 0, 'document': value})
        row = request(identity + '/publish', {'expected_revision': 1,
                      'expected_publication_version': 0, 'authorization': 'auto'})
        return {'version': row['version'], 'digest': row['digest']}, row['automation_id']

    suffix = uuid.uuid4().hex[:12]
    child_id, parent_id = 'check-child-' + suffix, 'check-parent-' + suffix
    child = document(child_id, [node('input', 'input', {}),
        node('choose', 'condition', {'operator': 'equals', 'left': '$input.enabled', 'right': True}),
        node('yes', 'set', {'value': 'yes'}), node('no', 'set', {'value': 'no'}),
        node('result', 'return', {'value': '$last'})],
        [edge('input', 'choose'), edge('choose', 'yes', 'true'), edge('choose', 'no', 'false'),
         edge('yes', 'result'), edge('no', 'result')])
    child_target, child_automation = publish(child)
    parent = document(parent_id, [node('input', 'input', {}),
        node('trim', 'loop', {'items': [' one ', ' two '], 'limit': 2, 'operation': 'trim'}),
        node('cost', 'calculation', {'operator': 'multiply', 'left': '$steps.trim.count', 'right': 3}),
        node('child', 'workflow_call', {'toolId': child_automation, 'version': 1, 'args': {'enabled': '$input.enabled'}}),
        node('result', 'return', {'value': {'items': '$steps.trim.items', 'cost': '$steps.cost', 'decision': '$last'}})],
        [edge('input', 'trim'), edge('trim', 'cost'), edge('cost', 'child'), edge('child', 'result')])
    parent_target, _ = publish(parent)
    outcomes = []
    try:
        request(parent_id + '/access', {**parent_target, 'enabled': True})
        for enabled in (True, False):
            body = {**parent_target, 'action_id': 'editor_' + uuid.uuid4().hex, 'args': {'enabled': enabled}}
            result = request(parent_id + '/runs', body)
            assert result['code'] == 'OK', result['code']
            assert result['result']['result'] == {'items': ['one', 'two'], 'cost': 6, 'decision': 'yes' if enabled else 'no'}
            assert request(parent_id + '/runs', body) == result, 'Replay changed the recorded outcome'
            outcomes.append({'action_id': body['action_id'], 'branch': enabled, 'code': result['code']})
        history = request(parent_id + '/runs')['items']
        assert len(history) == 2, 'Expected exactly two recorded actions'
    finally:
        failures = []
        for identity, target in ((parent_id, parent_target), (child_id, child_target)):
            try:
                result = request(identity + '/access', {**target, 'enabled': False})
                assert not result['enabled'], 'Temporary workflow grant was not removed'
            except Exception:
                failures.append(identity)
        if failures:
            raise RuntimeError('Remove temporary workflow access for: ' + ', '.join(failures))
    print(json.dumps({'parent_draft': parent_id, 'child_draft': child_id,
        'outcomes': outcomes, 'loop_and_calculation': 'verified', 'replay': 'verified',
        'temporary_grants_removed': True}, indent=2))


if __name__ == '__main__':
    main()
