from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

DEMO_EMAIL = 'demo@example.com'
DEMO_USERNAME = 'demo'
DEMO_PASSWORD = 'DemoPass123!'


class Command(BaseCommand):
    help = 'Seeds exactly one demo user for the login demo.'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username=DEMO_USERNAME,
            defaults={'email': DEMO_EMAIL},
        )
        user.email = DEMO_EMAIL
        user.set_password(DEMO_PASSWORD)
        user.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f'Created demo user: {DEMO_EMAIL}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Updated demo user: {DEMO_EMAIL}'))
