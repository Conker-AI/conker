"""Host-side Conker commands. Model operations reuse Pi's validated catalogue."""
import argparse
import getpass
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile


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
    if request['action'] == 'register':
        provider = request['provider']
        if any(m['id'] == target for m in config['models']):
            raise SystemExit('Model ID already exists; choose a new ID or use Settings to edit it.')
        existing = next((p for p in config['providers'] if p['id'] == provider), None)
        if existing and not existing['enabled']:
            raise SystemExit('Enable this provider in Settings before adding a model.')
        if not existing:
            config['providers'].append(dict(id=provider, name=provider, enabled=True))
        config['models'].append(dict(id=target, providerId=provider, name=target, route=request['route'], enabled=True))
        model_roles.save(store, model_roles.Update(expected_revision=value['revision'], configuration=config))
        print('Model added to the shared catalogue. Select it in Settings or with conker models use.')
        raise SystemExit(0)
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
    connect = actions.add_parser('connect', help='Privately configure a provider and add a model')
    connect.add_argument('provider', choices=['openrouter', 'openai', 'anthropic'])
    actions.add_parser('apply', help='Restart Pi to load staged provider credentials')
    return cli


def save_provider_file(path, variable, secret, paid):
    """Compose single-quoted values prevent interpolation; reject ambiguous key syntax."""
    if not secret or not re.fullmatch(r'[A-Za-z0-9_./:+=-]+', secret):
        raise ValueError('API key has unsupported characters. Nothing was saved.')
    values = path.read_text().splitlines() if path.exists() else []
    values = [line for line in values if not line.startswith((variable + '=', 'PI_ALLOW_PAID_MODELS='))]
    values += [f"{variable}='{secret}'", f'PI_ALLOW_PAID_MODELS={"true" if paid else "false"}']
    descriptor, name = tempfile.mkstemp(dir=path.parent, prefix='.providers-')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write('\n'.join(values) + '\n')
        os.chmod(name, 0o600)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def connect_provider(args, root, command):
    manifest = json.loads((root / 'compose.json').read_text())
    if './state/providers.env' not in manifest.get('services', {}).get('pi', {}).get('env_file', []):
        print('Run the updated deployment prepare.py first to enable the private provider file.', file=sys.stderr)
        return 1
    if not sys.stdin.isatty():
        print('Run connect in an interactive terminal; API keys are never command arguments.', file=sys.stderr)
        return 1
    # Verify Pi is reachable and the catalogue is initialized before collecting a secret.
    checked = subprocess.run(command + ['exec', '-T', 'pi', 'python', '-c', MODEL_COMMAND],
                             input=json.dumps({'action': 'list'}), text=True, capture_output=True, check=True)
    config = json.loads(checked.stdout)['configuration']
    if not config:
        print('Initialize the model catalogue first using bootstrap_models.py.', file=sys.stderr)
        return 1
    model = input('New catalogue ID (for example hosted-answer): ').strip()
    route = input('Exact provider model ID: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', model) or not route or len(route) > 300 or any(c.isspace() for c in route):
        raise ValueError('Invalid model ID or provider route. Nothing was saved.')
    if any(row['id'] == model for row in config['models']):
        raise ValueError('That catalogue ID already exists. Nothing was saved.')
    if any(row['id'] == args.provider and not row['enabled'] for row in config['providers']):
        raise ValueError('Enable this provider in Settings first. Nothing was saved.')
    print('Paid access is a Pi-wide setting. Enabling it permits configured hosted models to incur provider charges.')
    paid = input('Allow paid model calls across configured providers? [y/N]: ').strip().lower() == 'y'
    if not paid and (args.provider != 'openrouter' or not route.endswith(':free')):
        raise ValueError('This route requires paid-model permission. Nothing was saved.')
    secret = getpass.getpass('Provider API key (hidden): ').strip()
    save_provider_file(root / 'state/providers.env', 'PI_' + args.provider.upper() + '_KEY', secret, paid)
    payload = {'action': 'register', 'provider': args.provider, 'model': model, 'route': route}
    result = subprocess.run(command + ['exec', '-T', 'pi', 'python', '-c', MODEL_COMMAND],
                            input=json.dumps(payload), text=True, capture_output=True)
    if result.returncode:
        print('Credential staged, but catalogue update failed. Check Settings before retrying. No restart occurred.', file=sys.stderr)
        return 1
    print(result.stdout.strip())
    print('Credential saved privately; not yet active. Run conker models apply when no turn is running, then choose the model.')
    print('The key and route have not been tested against the provider. Send a test message after applying.')
    return 0


def main(argv=None):
    args = parser().parse_args(argv)
    root = Path(os.environ.get('CONKER_DEPLOY_DIR', str(Path.home() / 'conker-deploy')))
    compose = root / 'compose.json'
    if not compose.is_file():
        print(f'Deployment not found: {compose}. Set CONKER_DEPLOY_DIR or follow the installation guide.', file=sys.stderr)
        return 1
    command = ['docker', 'compose', '--project-directory', str(root), '-f', str(compose)]
    try:
        if args.command == 'models' and args.action == 'connect':
            return connect_provider(args, root, command)
        if args.command == 'models' and args.action == 'apply':
            if not sys.stdin.isatty() or input('Restart Pi and its decision service? Active turns may be interrupted. [y/N]: ').strip().lower() != 'y':
                print('No services restarted.')
                return 1
            return subprocess.run(command + ['up', '-d', '--no-deps', '--force-recreate', 'pi', 'decisions']).returncode
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
    except (ValueError, EOFError) as error:
        print(str(error) if isinstance(error, ValueError) else 'Input cancelled. No services restarted.', file=sys.stderr)
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError):
        print('Could not read deployment status. Check Docker and deployment configuration.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
