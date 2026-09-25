"""Host-side Conker commands. Model operations reuse Pi's validated catalogue."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


MODEL_COMMAND = r'''
import json, os, sys
from pi import model_roles
from pi.store import Store
request = json.load(sys.stdin)
store = Store(os.environ['PI_DB_PATH'])
value = model_roles.load(store)
config = value['configuration']
if request['action'] == 'list':
    print(json.dumps(value))
else:
    if not config:
        raise SystemExit('No model catalogue. Initialize models first.')
    target = request['model']
    providers = {p['id'] for p in config['providers'] if p['enabled']}
    model = next((m for m in config['models'] if m['id'] == target and m['enabled'] and m['providerId'] in providers), None)
    if not model or model['providerId'] == 'decisions':
        raise SystemExit('Choose an enabled answer model from conker models list.')
    config['defaultModelId'] = target
    config['roleSettings']['answerMode'] = 'manual'
    config['roleSettings']['roles']['answer'].update(enabled=True, modelId=target, eligibleModelIds=[target])
    model_roles.save(store, model_roles.Update(expected_revision=value['revision'], configuration=config))
    print('Answer model updated. Existing per-chat overrides remain in effect.')
'''


def parser():
    cli = argparse.ArgumentParser(prog='conker', description='Manage your Conker deployment.')
    commands = cli.add_subparsers(dest='command', required=True)
    commands.add_parser('status', help='Show running services')
    commands.add_parser('doctor', help='Check deployment files and Docker services')
    logs = commands.add_parser('logs', help='Show recent service logs')
    logs.add_argument('service', choices=['gateway', 'pi', 'memorygate', 'toolgate', 'systemgate', 'ollama', 'decisions', 'embeddings'])
    models = commands.add_parser('models', help='Inspect and select configured models')
    actions = models.add_subparsers(dest='action', required=True)
    actions.add_parser('list', help='List catalogue IDs and the answer assignment')
    use = actions.add_parser('use', help='Choose the default answer model')
    use.add_argument('model', help='An enabled catalogue ID from models list')
    return cli


def main(argv=None):
    args = parser().parse_args(argv)
    root = Path(os.environ.get('CONKER_DEPLOY_DIR', str(Path.home() / 'conker-deploy')))
    compose = root / 'compose.json'
    if not compose.is_file():
        print(f'Deployment not found: {compose}. Set CONKER_DEPLOY_DIR or follow the installation guide.', file=sys.stderr)
        return 1
    command = ['docker', 'compose', '--project-directory', str(root), '-f', str(compose)]
    try:
        if args.command == 'doctor':
            manifest = json.loads(compose.read_text())
            missing = [path for service in manifest.get('services', {}).values()
                       for path in service.get('env_file', []) if not (root / path).is_file()]
            if missing:
                print('Missing configuration files: ' + ', '.join(missing), file=sys.stderr)
                return 1
            print('Deployment configuration files found. Checking service state (no model calls).', flush=True)
            result = subprocess.run(command + ['ps', '--all', '--format', 'json'], capture_output=True, text=True, check=True)
            raw = result.stdout.strip()
            rows = json.loads(raw) if raw.startswith('[') else [json.loads(line) for line in raw.splitlines() if line.strip()]
            running = {row['Service'] for row in rows if row.get('State') == 'running' and row.get('Health') != 'unhealthy'}
            stopped = set(manifest.get('services', {})) - running
            for service in sorted(manifest.get('services', {})):
                print(f'{service}: {"needs attention" if service in stopped else "running"}')
            print('This checks container state, not authentication or end-to-end model responses.')
            return 1 if stopped else 0
        if args.command == 'status':
            return subprocess.run(command + ['ps', '--all']).returncode
        if args.command == 'logs':
            return subprocess.run(command + ['logs', '--tail', '100', args.service]).returncode
        payload = {'action': args.action, 'model': getattr(args, 'model', None)}
        result = subprocess.run(command + ['exec', '-T', 'pi', 'python', '-c', MODEL_COMMAND],
                                input=json.dumps(payload), text=True, capture_output=True)
        if result.returncode:
            print(result.stderr.strip() or 'Pi command failed. Run conker doctor.', file=sys.stderr)
            return result.returncode
        if args.action == 'list':
            value = json.loads(result.stdout)
            config = value['configuration']
            if not config:
                print('No model catalogue yet. Follow the model initialization guide.')
                return 0
            role = config['roleSettings']['roles']['answer']
            print(f"Answer selection: {config['roleSettings']['answerMode']} · {role.get('modelId') or 'unassigned'}")
            for model in config['models']:
                print(f"{model['id']}  {model['providerId']}/{model['route']}  {'enabled' if model['enabled'] else 'disabled'}")
        else:
            print(result.stdout.strip())
        return 0
    except FileNotFoundError:
        print('Docker was not found. Install Docker with the Compose plugin.', file=sys.stderr)
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError):
        print('Could not read deployment status. Check Docker and deployment configuration.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
